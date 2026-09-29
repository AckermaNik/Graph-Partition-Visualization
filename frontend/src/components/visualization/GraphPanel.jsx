import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { polygonHull, polygonContains } from 'd3-polygon';
import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import noverlap from 'graphology-layout-noverlap';
import { useLoadGraph, useRegisterEvents, useSigma } from '@react-sigma/core';
import { NodeCircleProgram } from 'sigma/rendering';
import { EdgeArrowProgram } from 'sigma/rendering';
// If the line above errors, use this instead:
// import NodeCircleProgram from "sigma/rendering/webgl/programs/node.circle";

/**project imports  */
import SigmaPanelSafe from '@/components/visualization/SigmaPanelSafe';
import { useConnectionID } from '@/api/connection';
import { fetchNodeData } from '@/api/neo4j';

function makePrefix(typeOrLabel) {
  const s = (typeOrLabel ?? '').trim();
  if (!s) return 'Un';

  const letters = s.replace(/[^A-Za-z]/g, '');

  // Use letters if they exist, otherwise fallback to original string
  const source = letters || s;

  // Cap to 2 characters ONLY if >=2 exist
  const prefix = source.length >= 2 ? source.slice(0, 3) : source;

  return prefix[0].toUpperCase() + prefix.slice(1).toLowerCase();
}

function assignShortLabels(allNodes) {
  // counters per "type"
  const counters = new Map(); // output map: nodeId -> shortLabel
  const labelsById = new Map();

  for (const n of allNodes) {
    const type =
      n?.data?.labels?.[0] || // Neo4j-style labels array
      n?.data?.type || // sometimes people store type here
      n?.label || // fallback
      'Anonymous';

    const prefix = makePrefix(type);
    const next = (counters.get(prefix) || 0) + 1;
    counters.set(prefix, next);

    labelsById.set(n.id, `${prefix}${next}`);
  }

  return labelsById;
}

function toBoldDigits(text) {
  return text.replace(/\d/g, (d) => String.fromCodePoint(0x1d7ec + Number(d)));
}

function buildGraphology(records, { maxNodes }, for_partitions, for_partitions_truly) {
  const g = new Graph({ type: 'directed', multi: true });

  const spread = Math.sqrt(records.graph.nodes.length) * 10; // e.g., for 5000 nodes, spread is ~700

  const allNodes = records?.graph?.nodes || [];

  //Precompute the Pe1/Pe2/... mapping once
  const shortLabels = assignShortLabels(allNodes);

  let added = 0;
  for (const n of allNodes) {
    if (added > maxNodes) break;
    if (g.hasNode(n.id)) continue;

    const short = shortLabels.get(n.id) || 'Un';

    g.addNode(n.id, {
      //node.attrs of node:
      type: undefined,
      label: `${n.label ?? 'Anonymous'} : ${short}`,
      displayLabel: n.label ?? 'Anonymous',
      // keep original label somewhere for inspector
      shortLabel: short,
      x: Math.random() * spread,
      y: Math.random() * spread,
      size: Number(n.size),
      color: n.color,
      data: n.data ?? {},
      pid: n.pid
    });

    added++;
  }

  for (const e of records?.graph?.edges || []) {
    if (!g.hasNode(e.source) || !g.hasNode(e.target)) continue; //for the nodes and edge constraints
    const sourceNode = g.getNodeAttributes(e.source);
    const targetNode = g.getNodeAttributes(e.target);
    // Inside buildGraphology
    const key = e.id;

    const isDifferentPid = sourceNode.pid !== targetNode.pid;
    if (for_partitions && isDifferentPid) continue; //dont include cross edges yet
    g.addDirectedEdgeWithKey(key, e.source, e.target, {
      label: isDifferentPid ? toBoldDigits(e.label) : e.label,
      size: isDifferentPid ? 1.4 : 2,
      color: isDifferentPid && for_partitions_truly ? '#b30707' : '#080404ae',
      data: e.data ?? {}
    });
  }

  return g;
}

function ApplySingleFocus({ selectedNodeId }) {
  const sigma = useSigma();

  // Focus set = selected + its 1-hop neighbors
  const focusedNodes = useMemo(() => {
    if (!selectedNodeId) return null;
    const g = sigma.getGraph();

    const s = new Set([selectedNodeId]);
    g.forEachNeighbor(selectedNodeId, (nbr) => s.add(nbr));
    return s;
  }, [sigma, selectedNodeId]);

  const nodeReducer = useCallback(
    (node, data) => {
      if (!selectedNodeId || !focusedNodes) return data;

      if (focusedNodes.has(node)) {
        // keep vivid (original color), raise above dimmed nodes
        return { ...data, zIndex: node === selectedNodeId ? 20 : 5 };
      }

      // dim everything else
      return { ...data, color: '#aeb0b8', zIndex: 1 };
    },
    [selectedNodeId, focusedNodes]
  );

  const edgeReducer = useCallback(
    (edge, data) => {
      if (!selectedNodeId || !focusedNodes) return data;

      const g = sigma.getGraph();
      const source = g.source(edge);
      const target = g.target(edge);

      const sourceFocused = focusedNodes.has(source);
      const targetFocused = focusedNodes.has(target);

      // show edges fully if they touch the focused subgraph (selected + 1hop)
      if (sourceFocused && targetFocused) {
        return { ...data, zIndex: 6 };
      }

      return { ...data, hidden: true, label: ' ' };
    },
    [sigma, selectedNodeId, focusedNodes]
  );

  useEffect(() => {
    //already invalidates the renderer
    sigma.setSetting('nodeReducer', nodeReducer);
    sigma.setSetting('edgeReducer', edgeReducer);

    return () => {
      // IMPORTANT: remove reducers with undefined (not null)
      // and avoid refresh here because sigma may already be disposed.
      try {
        sigma.setSetting('nodeReducer', undefined);
        sigma.setSetting('edgeReducer', undefined);
      } catch {
        // ignore: sigma might be unmounted/disposed during route changes/strictmode
      }
    };
  }, [sigma, nodeReducer, edgeReducer]);

  return null;
}

//Wiring component that connects React, Sigma, and your graph logic together.
//bind lifecycle + events + imperative APIs
function Inner({
  graphology,
  sigmaApiRef,
  overlayCanvasRef,
  overlayCanvasRef_Vis,
  onSelectNode,
  onGraphNodeClick,
  onClearSelection,
  onGraphStageClick,
  connectionID,
  enableHulls,
  partition_colors
}) {
  const loadGraph = useLoadGraph();
  const sigma = useSigma(); //consumes Sigma renderer instance created in <SigmaContainer>
  const registerEvents = useRegisterEvents();
  const hullsRef = useRef({}); // { [pid]: { pid, poly: [[x,y], ...] } }

  // Track what we loaded for THIS sigma instance
  const loadedForSigmaRef = useRef(new WeakMap());

  useEffect(() => {
    if (!graphology || !sigma) return;

    const loadedMap = loadedForSigmaRef.current;
    // // If we already loaded this graph into this sigma instance, do nothing.
    const alreadyLoadedGraph = loadedMap.get(sigma);
    if (alreadyLoadedGraph === graphology) return;
    //Mark as loaded *before* import to avoid re-entrancy / double effect
    loadedMap.set(sigma, graphology);

    // 1) Layout FIRST (mutates x/y)
    if (!enableHulls) {
      if (graphology.order > 1 && graphology.order <= 500) {
        hullsRef.current = null;
        forceAtlas2.assign(graphology, {
          iterations: 50,
          settings: {
            gravity: 0.002,
            scalingRatio: 80,
            strongGravityMode: false,
            linLogMode: true
          }
        });
      }
    }

    // 2) If we have clusters after anchoring cluster islands apart, now compute hulls
    if (enableHulls) {
      const partitionIds = [
        ...new Set(
          graphology
            .nodes()
            .map((nodeId) => graphology.getNodeAttribute(nodeId, 'pid'))
            .filter((pid) => pid !== null && pid !== undefined)
        )
      ];
      hullsRef.current = computeClusterHulls(graphology, partitionIds, 2);
    }

    sigma.getGraph().clear();

    // 3) Import/Copy MY graph into sigma.getGraph() (SIGMAS INTERNAL GRAPH OBJECT)
    loadGraph(graphology);

    requestAnimationFrame(() => {
      sigma.refresh();
      sigma.getCamera().animatedReset({ duration: 0 });
    });

    //  expose api
    if (sigmaApiRef) {
      sigmaApiRef.current = {
        zoomIn: () => sigma.getCamera().animatedZoom({ duration: 180 }),
        zoomOut: () => sigma.getCamera().animatedUnzoom({ duration: 180 }),
        zoomToFit: () => sigma.getCamera().animatedReset({ duration: 250 }),
        sigma
      };
    }

    if (overlayCanvasRef && overlayCanvasRef_Vis) {
      overlayCanvasRef_Vis.current = overlayCanvasRef.current; // assign actual DOM node
    }
  }, [enableHulls, graphology, loadGraph, overlayCanvasRef, overlayCanvasRef_Vis, sigma, sigmaApiRef]);

  useEffect(() => {
    if (!enableHulls) return;
    if (!sigma || !overlayCanvasRef?.current) return;

    const canvas = overlayCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;

      // clear in device pixels
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // draw in CSS pixels (sigma graphToViewport uses CSS pixels)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // 1.draw the hulls over the cluster islands
      const hulls = hullsRef.current;
      if (!hulls) return;

      for (const polyObj of Object.values(hulls)) {
        if (!polyObj) continue;

        const pid = polyObj.pid;
        const base = partition_colors[String(pid)] ?? '#7d1212';
        ctx.fillStyle = hullFill(base);
        ctx.strokeStyle = hullStroke(base);
        ctx.lineWidth = 2;

        const { kind, points, poly } = polyObj;

        if (kind === 'circle') {
          const { x, y } = sigma.graphToViewport({ x: points[0][0], y: points[0][1] });
          const r = 100;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else if (kind === 'capsule') {
          const p0 = sigma.graphToViewport({ x: points[0][0], y: points[0][1] });
          const p1 = sigma.graphToViewport({ x: points[1][0], y: points[1][1] });
          const r = 28;
          const dx = p1.x - p0.x;
          const dy = p1.y - p0.y;
          const angle = Math.atan2(dy, dx);

          ctx.beginPath();
          ctx.arc(p0.x, p0.y, r, angle + Math.PI / 2, angle + (3 * Math.PI) / 2);
          ctx.arc(p1.x, p1.y, r, angle - Math.PI / 2, angle + Math.PI / 2);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else if (kind === 'hull') {
          const v = poly.map(([x, y]) => sigma.graphToViewport({ x, y }));
          ctx.beginPath();
          ctx.moveTo(v[0].x, v[0].y);
          for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }

      const graph = sigma.getGraph();
      const pids = listPidsFromGraph(graph);

      // 2. Draw Cluster Titles
      pids.forEach((pid) => {
        // Filter nodes belonging to this PID
        const nodes = graph.nodes().filter((n) => Number(graph.getNodeAttribute(n, 'pid')) === pid);
        if (nodes.length === 0) return;

        // Calculate the average position (centroid) of the cluster
        let sumX = 0;
        let sumY = 0;
        nodes.forEach((n) => {
          const pos = graph.getNodeAttributes(n);
          sumX += pos.x;
          sumY += pos.y;
        });

        const avgX = sumX / nodes.length;
        const avgY = sumY / nodes.length;

        // Convert Graph coords to Screen coords
        const screenPos = sigma.graphToViewport({ x: avgX, y: avgY });

        const centerX = canvas.width / (2 * dpr);
        const centerY = canvas.height / (2 * dpr);

        const dx = screenPos.x - centerX;
        const dy = screenPos.y - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Push label pixels further out from the center
        const offsetX = (dx / distance) * 195;
        const offsetY = (dy / distance) * 110;

        // Text Styling
        ctx.fillStyle = 'rgb(10, 10, 10)'; // Neutral grey, or use partition_colors[pid-1]
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`Cluster ${pid}`, screenPos.x + offsetX, screenPos.y + offsetY);
      });
    };

    // draw after every sigma render
    sigma.on('afterRender', draw);
    draw();

    return () => {
      sigma.off('afterRender', draw);
      // clear on unmount
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [sigma, overlayCanvasRef, enableHulls, partition_colors]);

  // --- Interaction events ---
  useEffect(() => {
    registerEvents({
      //WHEN USER CLICKS A NODE
      clickNode: async ({ node }) => {
        const g = sigma.getGraph();
        const nodeAttrs = g.getNodeAttributes(node); //the data array of key-value pairs

        // Get all edges connected to node (in+out for directed graphs)
        const edges = g.edges(node);

        //count the relationships types present
        const relCounts = new Map();

        for (const edgeId of edges) {
          const attrs = g.getEdgeAttributes(edgeId);
          const type = attrs.data?.type || 'REL';

          relCounts.set(type, (relCounts.get(type) || 0) + 1);
        }

        // Map into relationship objects for buttons
        const allRels = edges.map((edgeId) => {
          const eAttrs = g.getEdgeAttributes(edgeId);
          const sourceId = g.source(edgeId);
          const targetId = g.target(edgeId);

          // 1. Get the full attribute objects safely
          const sAttrs = g.getNodeAttributes(sourceId);
          const tAttrs = g.getNodeAttributes(targetId);

          // 2. Take the label of source and target node
          // This handles cases where 'labels' is missing or empty
          const sourceLabel = sAttrs?.data?.labels?.[0] || sourceId;
          const targetLabel = tAttrs?.data?.labels?.[0] || targetId;

          return {
            id: edgeId,
            type: eAttrs.data?.type || 'Anonymous',
            attrs: eAttrs,
            source: sourceLabel,
            target: targetLabel
          };
        });

        //Filter for unique relationships
        const seen = new Map();
        const distinctRels = allRels.filter((rel) => {
          const key = `${rel.source}-${rel.type}-${rel.target}`;
          if (seen.has(key)) return false;
          seen.set(key, true);
          return true;
        });

        // 1) fade selection
        //That immediately executes the function that was created in Visualization with the constracted arguments
        onSelectNode?.(node);

        // fetch global relationship stats for this node
        let globalrels = [];
        try {
          if (connectionID) {
            globalrels = await fetchNodeData({ node_id: node, conn_id: connectionID });
          }
        } catch (e) {
          console.error('fetchNodeRelStats failed:', e);
        }

        // console.log(nodeAttrs);
        // 2) open inspector with node + relationships
        //That immediately executes the function that was created in Visualization with the constracted arguments
        onGraphNodeClick({
          id: node,
          attrs: nodeAttrs,
          distinctRels,
          relCounts,
          globalrels
        });
      },

      //fires when the user clicks on empty space in the canvas
      clickStage: () => {
        onClearSelection?.();
        onGraphStageClick?.();
      }
    });
  }, [registerEvents, sigma, onSelectNode, onGraphNodeClick, onClearSelection, onGraphStageClick, connectionID]);

  return null;
}

export default function GraphPanel({
  records, // panel.result (kind: "graph")
  maxNodes,

  partition_colors,

  sigmaApiRef, // ref for floating graph control buttons per panel
  overlayCanvasRef_Vis,

  selectedNodeId,
  onSelectNode,
  onClearSelection,

  onGraphNodeClick, // <-- for inspector: {id, attrs, rels}
  onGraphStageClick
}) {
  const connectionID = useConnectionID();

  const wrapperRef = useRef(null);
  const overlayRef = useRef(null);

  console.log(records);

  const for_partitions = !!records?.partitions || !!records?.for_query_partitions;

  // built MY graph
  const graphology = useMemo(() => {
    if (!records || records.kind !== 'graph') return null;

    if (!for_partitions) {
      return buildGraphology(records, { maxNodes }, false, false);
    }

    // 1. Build layout graph (NO cross edges)
    const layoutGraph = buildGraphology(records, { maxNodes }, true, true);

    // 2. Run layout HERE (not in Inner)
    const pids = listPidsFromGraph(layoutGraph);
    const centers = generateGridCenters(pids);

    layoutPerPid(layoutGraph, pids);
    anchorClustersToCenters(layoutGraph, centers, { jitter: 20 });

    // 3. Build full graph (WITH cross edges)
    const fullGraph = buildGraphology(records, { maxNodes }, false, true);

    // 4. Copy positions
    layoutGraph.forEachNode((node) => {
      const { x, y } = layoutGraph.getNodeAttributes(node);
      fullGraph.setNodeAttribute(node, 'x', x);
      fullGraph.setNodeAttribute(node, 'y', y);
    });

    return fullGraph;
  }, [records, maxNodes, for_partitions]);

  const sigmaSettings = useMemo(
    () => ({
      renderLabels: true,
      labelRenderedSizeThreshold: 8,
      defaultDrawNodeLabel: drawNodeLabelInside,
      labelDensity: 1,
      labelGridCellSize: 30,
      defaultNodeColor: '#807d7d',
      enableEdgeHovering: true,
      defaultEdgeColor: '#a99595',
      enableHovering: true,
      renderEdgeLabels: true,
      edgeLabelSize: 10,
      edgeLabelDensity: 3, //how many labels are visible at any given zoom level
      edgeLabelGridCellSize: 60,
      edgeLabelRenderedSizeThreshold: 2,
      defaultEdgeType: 'arrow',

      edgeProgramClasses: {
        arrow: EdgeArrowProgram
      },
      defaultNodeType: 'circle',
      nodeProgramClasses: {
        circle: NodeCircleProgram
      }
    }),
    [drawNodeLabelInside, EdgeArrowProgram, NodeCircleProgram]
  );

  useEffect(() => {
    if (!for_partitions) return;

    const container = wrapperRef.current;
    const canvas = overlayRef.current;
    if (!container || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1; //How many physical screen pixels represent one CSS pixel.
      const rect = container.getBoundingClientRect(); //This is how big it looks on screen.

      //Canvas has two sizes:

      // 1) Set CSS size (layout pixels)
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      // 2) Set buffer size (device pixels)(actual pixel resolution)
      const nextW = Math.max(1, Math.round(rect.width * dpr));
      const nextH = Math.max(1, Math.round(rect.height * dpr));

      if (canvas.width !== nextW) canvas.width = nextW;
      if (canvas.height !== nextH) canvas.height = nextH;

      // 3) Make drawing coordinates use CSS pixels (so you can draw in rect.width/height units)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    //imidiate resize
    resize();
    //Ensures resize runs after layout stabilization.
    const raf = requestAnimationFrame(resize);

    const ro = new ResizeObserver(resize);
    ro.observe(container);

    // window.addEventListener('resize', resize); //Whenever the browser window changes size, call the resize function

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      // window.removeEventListener('resize', resize);
    };
  }, [for_partitions]);

  return (
    <div ref={wrapperRef} style={{ position: 'relative', height: '100%', width: '100%', minHeight: 0 }}>
      {for_partitions && (
        <canvas
          ref={overlayRef}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 2,
            width: '100%',
            height: '100%',
            pointerEvents: 'none' // IMPORTANT: clicks go to Sigma
          }}
        />
      )}

      <SigmaPanelSafe
        settings={sigmaSettings}
        style={{ height: '100%', width: '100%' }} // IMPORTANT: not absolute
      >
        <Inner
          graphology={graphology}
          sigmaApiRef={sigmaApiRef}
          overlayCanvasRef_Vis={overlayCanvasRef_Vis}
          onSelectNode={onSelectNode}
          onClearSelection={onClearSelection}
          onGraphNodeClick={onGraphNodeClick}
          onGraphStageClick={onGraphStageClick}
          connectionID={connectionID}
          overlayCanvasRef={overlayRef}
          enableHulls={for_partitions}
          partition_colors={partition_colors}
        />
        <ApplySingleFocus selectedNodeId={selectedNodeId} />
      </SigmaPanelSafe>
    </div>
  );
}

function drawNodeLabelInside(context, data) {
  // data is "display data" for the node label draw pass
  const label = data.shortLabel;
  if (!label) return;

  const size = data.size || 0;
  if (size < 10) return; // avoid unreadable text

  const fontSize = Math.max(8, Math.min(13, size * 0.7));
  context.font = `bold ${fontSize}px sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  context.fillStyle = '#fff';
  context.fillText(label, data.x, data.y);
}

function computeClusterHulls(graph, pids, minPoints = 2) {
  const pts = {};
  pids.forEach((pid) => (pts[pid] = []));

  graph.forEachNode((id, attrs) => {
    const pid = attrs.pid;
    if (!pids.includes(pid)) return;
    pts[pid].push([attrs.x, attrs.y]);
  });

  const hulls = {};
  for (const pid of pids) {
    const points = pts[pid];
    if (points.length === 0) continue;

    if (points.length === 1) {
      // circle case — store single point, no poly
      hulls[pid] = { pid, points, poly: null, kind: 'circle' };
    } else if (points.length === 2) {
      // capsule case — store both points, no poly
      hulls[pid] = { pid, points, poly: null, kind: 'capsule' };
    } else {
      // normal convex hull (needs 3+ points)
      const hull = polygonHull(points);
      if (!hull || hull.length < minPoints) continue;
      hulls[pid] = { pid, points, poly: hull, kind: 'hull' };
    }
  }
  return hulls;
}

//helper for the clusters' perimeter color from hex to rgba
function hexToRgba(hex, a) {
  if (!hex || typeof hex !== 'string') return `rgba(0,0,0,${a})`;
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return hex.startsWith('rgba') ? hex : `rgba(0,0,0,${a})`;
  const int = parseInt(m[1], 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r},${g},${b},${a})`;
}
//fill: alpha ~ 0.06 stroke: alpha ~ 0.35
function hullFill(color) {
  return hexToRgba(color, 0.06);
}
function hullStroke(color) {
  return hexToRgba(color, 0.35);
}

function anchorClustersToCenters(graph, centers, opts = {}) {
  const jitter = opts.jitter ?? 0;

  // 1) compute centroid per pid (current layout result)
  const acc = new Map(); // pid -> {sx, sy, n}

  graph.forEachNode((id, attrs) => {
    const pid = attrs.pid;
    if (pid == null) return;

    const cur = acc.get(pid) || { sx: 0, sy: 0, n: 0 };
    cur.sx += attrs.x;
    cur.sy += attrs.y;
    cur.n += 1; //how many nodes a cluster has
    acc.set(pid, cur);
  });

  const centroid = new Map();
  for (const [pid, v] of acc.entries()) {
    if (v.n > 0) centroid.set(pid, { x: v.sx / v.n, y: v.sy / v.n });
  }

  // 2) translate each cluster to its target center
  graph.forEachNode((id, attrs) => {
    const pid = attrs.pid;
    if (pid == null) return;

    const c0 = centroid.get(pid);
    const target = centers[pid] ?? { x: 0, y: 0 };
    if (!c0) return;

    const dx = target.x - c0.x;
    const dy = target.y - c0.y;

    graph.setNodeAttribute(id, 'x', attrs.x + dx + (Math.random() - 0.5) * jitter);
    graph.setNodeAttribute(id, 'y', attrs.y + dy + (Math.random() - 0.5) * jitter);
  });
}

//create a new subgraph for each cluster id with its nodes and relationships and return it
function inducedSubgraph(graph, nodeIds) {
  // simple induced subgraph copy (nodes + edges between them)
  const sub = new Graph({ type: 'directed', multi: true });
  const set = new Set(nodeIds);

  nodeIds.forEach((id) => {
    sub.addNode(id, { ...graph.getNodeAttributes(id) });
  });

  graph.forEachEdge((eid, attrs, source, target, sAttrs, tAttrs) => {
    if (!set.has(source) || !set.has(target)) return;
    sub.addDirectedEdgeWithKey(eid, source, target, { ...attrs });
  });

  return sub;
}

function seedRandomPositions(g) {
  g.forEachNode((id, attrs) => {
    if (typeof attrs.x !== 'number' || typeof attrs.y !== 'number') {
      g.setNodeAttribute(id, 'x', (Math.random() - 0.5) * 100);
      g.setNodeAttribute(id, 'y', (Math.random() - 0.5) * 100);
    }
  });
}

//get all available pids in the sigma graph
function listPidsFromGraph(graph) {
  const s = new Set();
  graph.forEachNode((id, attrs) => {
    const pid = attrs.pid;
    if (pid != null) s.add(Number(pid));
  });
  return Array.from(s).sort((a, b) => a - b);
}

function layoutPerPid(graph, pids) {
  for (const pid of pids) {
    //categorize each node of the graph according their cluster id and make a cluster/island for each cljuster id
    const nodes = [];
    graph.forEachNode((id, attrs) => {
      const c = Number(attrs.pid);
      if (c === pid) nodes.push(id);
    });
    if (nodes.length === 0) continue;

    // layout this island only
    const sub = inducedSubgraph(graph, nodes); //create a new subgraph for each cluster id with its nodes and relationships and return it
    seedRandomPositions(sub);

    // <-- collision resolution
    noverlap.assign(sub, {
      maxIterations: 150,
      settings: {
        ratio: 6, // spacing multiplier
        margin: 3 // extra padding
      }
    });

    applySubgraphLayoutBack(sub, graph); // apply to the original sigma graph the new x,y coordinates of each node
  }
}
// apply to the original sigma graph(main) the new x,y coordinates of each node according to what cluster/sub they are
function applySubgraphLayoutBack(sub, main) {
  sub.forEachNode((id, attrs) => {
    main.setNodeAttribute(id, 'x', attrs.x);
    main.setNodeAttribute(id, 'y', attrs.y);
  });
}
function generateGridCenters(pids, spacing = 1000) {
  const reversed_pids = pids.reverse(); // 6,5,4...
  const centers = {};
  // Calculate columns (e.g., for 8 pids, sqrt is ~2.8, ceil is 3)
  const columns = Math.ceil(Math.sqrt(reversed_pids.length));

  reversed_pids.forEach((pid, index) => {
    let col = Math.abs(index - reversed_pids.length + 1) % columns; // 0, 1, 2...
    const row = Math.floor(index / columns); // 0, 0, 0, 1, 1...

    centers[pid] = {
      x: col * spacing,
      y: row * spacing
    };
  });

  return centers;
}
