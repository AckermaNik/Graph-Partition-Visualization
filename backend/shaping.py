from neo4j.graph import Node, Relationship, Path
from neo4j.time import DateTime, Date, Time, Duration
from neo4j.spatial import Point
import math


BASE_SIZE = 15
BOOST_IF_OVER = 1000


def _is_virtual_node(v):
    if not isinstance(v, dict):
        return False
    return all(k in v for k in ["labels", "id"]) or "element_id" in v


def _is_virtual_rel(v):
    if not isinstance(v, dict):
        return False
    has_type = "type" in v
    has_connectors = ("source" in v and "target" in v) or ("start" in v and "end" in v)
    return has_type and has_connectors


def _contains_graph(v) -> bool:
    if isinstance(v, (Node, Relationship, Path)):
        return True
    if _is_virtual_node(v) or _is_virtual_rel(v):
        return True
    if isinstance(v, list):
        return any(_contains_graph(x) for x in v)
    if isinstance(v, dict):
        return any(_contains_graph(x) for x in v.values())
    return False


def get_id(x):
    if isinstance(x, Node):
        return x.element_id
    if isinstance(x, dict) and _is_virtual_node(x):
        return x.get("element_id") or x.get("id")
    return str(x)


def _collect_graph(value, nodes: dict, edges: dict, for_partitions: bool,
                   node_ids: set | None = None):
    """Iterative (non-recursive) graph collector."""
    stack = [value]
    while stack:
        v = stack.pop()

        if isinstance(v, Node):
            nid = v.element_id
            if nid not in nodes:
                props = dict(v)
                props["labels"] = list(v.labels)
                nodes[nid] = props
            if node_ids is not None:
                node_ids.add(nid)

        elif _is_virtual_node(v):
            nid = v.get("element_id") or v.get("id")
            if "labels" not in v:
                v["labels"] = ["Virtual"]
            nodes.setdefault(str(nid), v)

        elif isinstance(v, Relationship):
            rid = v.element_id
            if for_partitions and rid in edges:
                continue
            if rid not in edges:
                props = dict(v)
                props["type"]   = v.type
                props["source"] = v.start_node.element_id
                props["target"] = v.end_node.element_id
                edges[rid] = props
            stack.append(v.start_node)
            stack.append(v.end_node)

        elif _is_virtual_rel(v):
            rid = str(v.get("element_id") or v.get("id") or f"v-{id(v)}")
            if rid not in edges:
                source = v.get("source") or v.get("start")
                target = v.get("target") or v.get("end")
                props = dict(v)
                props.update({
                    "source": get_id(source),
                    "target": get_id(target),
                    "type":   v.get("type"),
                })
                edges[rid] = props
                stack.append(source)
                stack.append(target)

        elif isinstance(v, Path):
            for n in v.nodes:
                stack.append(n)
            for r in v.relationships:
                stack.append(r)

        elif isinstance(v, list):
            stack.extend(v)

        elif isinstance(v, dict):
            stack.extend(v.values())


def shape_result(records, column_names, for_anonymous,
                                colors, for_partitions, pid_name):
    """
    Single-pass collector. Returns (node_ids, finish_fn).

    Handles both regular queries and partition queries (for_partitions=True).
    Call finish_fn(global_degrees) after the degree query to get the final
    shaped result — no re-traversal of records needed.
    """
    nodes       = {}
    edges       = {}
    rows        = []
    graph_found = False
    node_ids    = set()

    keep_indices  = []
    clean_columns = []

    all_records = list(records)
    print(" ALL REC:", len(all_records))

    if all_records:
        first_record = all_records[0]
        for i, key in enumerate(column_names):
            val = first_record.get(key)
            if not _contains_graph(val) or for_anonymous:
                keep_indices.append(i)
                clean_columns.append(key)

    for rec in all_records:
        clean_row = []
        for i, key in enumerate(column_names):
            val = rec.get(key)

            if not for_anonymous:
                if for_partitions:
                    if key == "finalNode" and val is not None:
                        _collect_graph(val, nodes, edges, True, node_ids=node_ids)
                        graph_found = True
                    elif key == "edgeList" and isinstance(val, list):
                        graph_found = True
                        for edge_item in val:
                            isCross = edge_item.get("crossCount", 0) > 0
                            if not isCross:
                                localEdges = edge_item.get("localEdges")
                                if localEdges is None:
                                    continue
                                for local_rel in localEdges:
                                    _collect_graph(local_rel, nodes, edges, True, node_ids=node_ids)
                                    rid = local_rel.element_id
                                    if rid in edges:
                                        edges[rid]["fake_type"] = edges[rid]["type"]
                                        edges[rid]["isCross"] = isCross
                            else:
                                rel = edge_item.get("rel")
                                if rel is None:
                                    continue
                                _collect_graph(rel, nodes, edges, True, node_ids=node_ids)
                                rid = rel.element_id
                                rel_counts = edge_item.get("crossCount")
                                if rid in edges:
                                    edges[rid]["fake_type"] = str(rel_counts)
                                    edges[rid]["isCross"] = isCross
                    # Newer partition queries return ordinary graph columns
                    # (for example: RETURN a, r, b) instead of the legacy
                    # finalNode/edgeList structure.
                    elif _contains_graph(val):
                        graph_found = True
                        _collect_graph(val, nodes, edges, True, node_ids=node_ids)

                        if isinstance(val, Relationship):
                            rid = val.element_id
                            if rid in edges:
                                edges[rid]["fake_type"] = edges[rid]["type"]
                else:
                    if _contains_graph(val):
                        graph_found = True
                        _collect_graph(val, nodes, edges, False, node_ids=node_ids)

            if i in keep_indices:
                clean_row.append(_to_primitive(val))

        if clean_row:
            rows.append(clean_row)

    def finish_fn(global_degrees: dict) -> dict:
        table_payload = None
        if clean_columns and rows:
            table_payload = {
                "columns": clean_columns,
                "rows":    rows,
                "count":   len(rows),
            }

        if not graph_found:
            return {"kind": "table", "table": table_payload}

        sigma_nodes = []
        for nid, n in nodes.items():
            labels = n.get("labels", [])
            primary_label = labels[0] if labels else "Anonymous"

            node_color = colors.get(primary_label, "#756363")

            d = global_degrees.get(nid, 0) if global_degrees else 0
            if d > BOOST_IF_OVER:
                if for_partitions:
                    size = BASE_SIZE * 1.5
                else:
                    size = BASE_SIZE + math.log(d - BOOST_IF_OVER + 1) * 2.5
            else:
                size = BASE_SIZE

            sigma_nodes.append({
                "id":    nid,
                "label": primary_label,
                "x":     n.get("x", 0),
                "y":     n.get("y", 0),
                "size":  size,
                "color": node_color,
                "pid":   n.get(pid_name),# universall name for the frontend to read no matter the real pid name
                "data":  n,
            })

        node_pid_map = {node["id"]: node["pid"] for node in sigma_nodes}

        sigma_edges = []
        for eid, e in edges.items():
            source_pid = node_pid_map.get(e["source"])
            target_pid = node_pid_map.get(e["target"])
            sigma_edges.append({
                "id":      eid,
                "source":  e["source"],
                "target":  e["target"],
                "label":   e.get("fake_type") if for_partitions else e.get("type"),
                "size":    e.get("size", 1),
                "color":   e.get("color", "#776C6C"),
                "data":    e,
                "isCross": source_pid != target_pid,
            })

        return {
            "kind":  "graph",
            "graph": {"nodes": sigma_nodes, "edges": sigma_edges},
            "table": table_payload,
        }

    return list(node_ids), finish_fn


def _to_primitive(v):
    if isinstance(v, Node):
        return {"element_id": v.element_id, "labels": list(v.labels),
                **{k: _to_primitive(val) for k, val in dict(v).items()}}
    if _is_virtual_node(v):
        return {**{k: _to_primitive(val) for k, val in v.items()}}
    if isinstance(v, Relationship):
        return {
            "element_id": v.element_id, "type": v.type,
            "source": v.start_node.element_id, "target": v.end_node.element_id,
            **{k: _to_primitive(val) for k, val in dict(v).items()}
        }
    if _is_virtual_rel(v):
        return {**{k: _to_primitive(val) for k, val in v.items()}}
    if isinstance(v, (DateTime, Date, Time)):
        return v.isoformat()
    if isinstance(v, Duration):
        return str(v)
    if isinstance(v, Point):
        ref_system = getattr(v, "srid", getattr(v, "crs", "anonymous"))
        return {"x": v.x, "y": v.y, "z": getattr(v, "z", None), "srid": ref_system}
    if isinstance(v, list):
        return [_to_primitive(x) for x in v]
    if isinstance(v, dict):
        return {k: _to_primitive(x) for k, x in v.items()}
    return v
