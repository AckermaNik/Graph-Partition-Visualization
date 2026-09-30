# backend/schema.py
from fastapi import HTTPException


def norm_rel_type(t: str) -> str:
    """
    Normalize relationship type names that may come back as Cypher-rendered identifiers,
    e.g. :`CONTAINEROF` vs CONTAINEROF.
    """
    if not t:
        return ""
    t = t.strip()
    if t.startswith(":"):
        t = t[1:].lstrip()
    if len(t) >= 2 and t[0] == "`" and t[-1] == "`":
        t = t[1:-1]
    return t.strip()


async def compute_schema(driver) -> dict:
    try:
        async with driver.session() as session:

            # -----------------------------
            # 1) Node properties per label
            # -----------------------------
            result = await session.run("""
                CALL db.schema.nodeTypeProperties()
                YIELD nodeLabels, propertyName
                WHERE propertyName IS NOT NULL
                WITH nodeLabels, collect(DISTINCT propertyName) AS props
                RETURN nodeLabels, [p IN props WHERE p IS NOT NULL] AS props
            """)
            node_props_rows = [dict(r) async for r in result]

            node_properties: dict[str, set[str]] = {}
            for r in node_props_rows:
                labels = r.get("nodeLabels") or []
                props = r.get("props") or []
                for lbl in labels:
                    node_properties.setdefault(lbl, set()).update(props)

            node_properties_sorted: dict[str, list[str]] = {
                k: sorted(v) for k, v in node_properties.items()
            }

            # -----------------------------
            # 2) Relationship properties per type
            # -----------------------------
            rel_properties_raw: dict[str, list[str]] = {}

            try:
                result = await session.run("""
                    CALL db.schema.relTypeProperties()
                    YIELD relType, propertyName
                    WHERE propertyName IS NOT NULL
                    WITH relType, collect(DISTINCT propertyName) AS props
                    RETURN relType, [p IN props WHERE p IS NOT NULL] AS props
                """)
                rel_props_rows = [dict(r) async for r in result]
                rel_properties_raw = {
                    r["relType"]: sorted(r.get("props") or [])
                    for r in rel_props_rows
                    if r.get("relType")
                }
            except Exception:
                print ("Relationship properties per type FAILED.")

            rel_props_norm: dict[str, set[str]] = {}
            for rt, props in rel_properties_raw.items():
                k = norm_rel_type(rt)
                if not k:
                    continue
                rel_props_norm.setdefault(k, set()).update(props or [])
            rel_properties_sorted: dict[str, list[str]] = {
                k: sorted(v) for k, v in rel_props_norm.items()
            }

            # -----------------------------
            # 3) Edges from real data
            # -----------------------------
            result = await session.run("""
                MATCH (a)-[r]->(b)
                UNWIND labels(a) AS fromLabel
                UNWIND labels(b) AS toLabel
                RETURN DISTINCT fromLabel AS `from`, type(r) AS `type`, toLabel AS `to`
            """)
            edges_rows = [dict(r) async for r in result]

            edges_set: set[tuple[str, str, str]] = set()
            for row in edges_rows:
                f = row.get("from")
                t = norm_rel_type(row.get("type"))
                to = row.get("to")
                if f and t and to:
                    edges_set.add((f, t, to))

            edges_list = sorted(
                [{"from": f, "type": t, "to": to} for (f, t, to) in edges_set],
                key=lambda x: (x["from"], x["type"], x["to"]),
            )
            
            # -----------------------------
            # 4) Labels, types, counts + per-label/type breakdown.
            #
            # Use regular read-only Cypher instead of db.stats.retrieve('GRAPH COUNTS').
            # Aura Free restricts that administrative procedure even for otherwise
            # valid database users.
            # -----------------------------
            node_labels: list[str] = []
            rel_types: list[str] = []
            node_count: int = 0
            rel_count: int = 0
            node_label_counts: dict[str, int] = {}
            rel_type_counts: dict[str, int] = {}

            result = await session.run("MATCH (n) RETURN count(n) AS count")
            record = await result.single()
            node_count = record["count"] if record else 0

            result = await session.run("""
                MATCH (n)
                UNWIND labels(n) AS label
                RETURN label, count(*) AS count
                ORDER BY label
            """)
            async for record in result:
                label = record["label"]
                node_labels.append(label)
                node_label_counts[label] = record["count"]

            result = await session.run("MATCH ()-[r]->() RETURN count(r) AS count")
            record = await result.single()
            rel_count = record["count"] if record else 0

            result = await session.run("""
                MATCH ()-[r]->()
                RETURN type(r) AS relType, count(*) AS count
                ORDER BY relType
            """)
            async for record in result:
                rel_type = norm_rel_type(record["relType"])
                if rel_type:
                    rel_types.append(rel_type)
                    rel_type_counts[rel_type] = record["count"]

            # -----------------------------
            # 5) Union labels / types
            # -----------------------------
            edge_node_labels = {e["from"] for e in edges_list} | {e["to"] for e in edges_list}
            all_node_labels = sorted(set(node_labels) | edge_node_labels | set(node_properties_sorted.keys()))

            edge_rel_types = {e["type"] for e in edges_list}
            all_rel_types = sorted(set(rel_types) | edge_rel_types)

            for lbl in all_node_labels:
                node_properties_sorted.setdefault(lbl, [])
            for rt in all_rel_types:
                rel_properties_sorted.setdefault(rt, [])

            return {
                "nodeLabels": all_node_labels,
                "relationshipTypes": all_rel_types,
                "nodeProperties": node_properties_sorted,
                "relProperties": rel_properties_sorted,
                "edges": edges_list,
                "nodeCount": node_count,
                "relationshipCount": rel_count,
                "nodeLabelCounts": node_label_counts,
                "relTypeCounts": rel_type_counts,
            }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
