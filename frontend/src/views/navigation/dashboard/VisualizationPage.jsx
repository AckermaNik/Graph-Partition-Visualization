//react imports
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import Spinner from 'react-bootstrap/Spinner';
import { useLocation } from 'react-router-dom';

//project imports
import MainCard from '@/components/MainCard';
import ExplorePage from '@/views/navigation/dashboard/ExplorePage';
import { useAppState } from '@/context/useAppState';
import { exportGraphWithOverlay } from '@/context/sigma_PNG_Export.js';
import GraphPanel from '@/components/visualization/GraphPanel';
import InspectorDrawer from '@/components/visualization/InspectorDrawer';
import TableResult from '@/components/visualization/TableResult';
import ExportCsvButton from '@/components/visualization/ExportCsvButton';
import { fetchPartitions, fetchPartitionsStats } from '@/api/neo4j';
import { useConnectionID } from '@/api/connection';
import { getPartitionColorMap } from '@/components/visualization/partitionColors';

function comparePartitionIds(a, b) {
  const numericA = Number(a);
  const numericB = Number(b);

  if (Number.isFinite(numericA) && Number.isFinite(numericB)) {
    return numericA - numericB;
  }

  return String(a).localeCompare(String(b));
}

function waitForCanvasPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

export default function Visualization() {
  const maxNodes = 1000;

  const connectionID = useConnectionID();

  const { state } = useLocation();
  const noPid = state?.noPid === true || state?.noPid === 'True';

  const [refreshCL, setRefreshCL] = useState(false);
  const [loadingClusters, setLoadingClusters] = useState(false);

  const sigmaApisRef = useRef({});
  const overlayRef_vis = useRef({});
  const panelRefs = useRef({});
  const clusterRequestInFlightRef = useRef(false);

  const { panels, removePanel, addPanel, updatePanel, activePanelId, setActivePanelId } = useAppState();

  const [selectedByPanel, setSelectedByPanel] = useState({}); //store data as key-value pairs

  const [inspector, setInspector] = useState({
    open: false,
    node: null, // { id, attrs, rels: [...] }
    panelId: null // which graph panel this belongs to
  });

  const [hideWelcomePanel, setHideWelcomePanel] = useState(false);

  const renderPanelBody = (panel, maxNodes, sigmaApisRef) => {
    if (panel.status === 'error') {
      const msg = `${panel.error?.message ?? 'Error'} (connectionID=${panel.error?.connectionID ?? 'null'})`;

      return (
        <div className="text-danger" style={{ padding: 12 }}>
          {msg}
        </div>
      );
    }

    if (panel.status === 'loading') {
      return (
        <div className="spinner">
          <Spinner animation="border" role="status" style={{ width: '7rem', height: '7rem' }}>
            <span className="visually-hidden">Loading...</span>
          </Spinner>
        </div>
      );
    }

    if (panel.status === 'success') {
      const result = panel.result;
      const for_partions = panel.result.partitions;
      const for_query_partitions = panel.result?.for_query_partitions;
      const how_many_clusters = panel.result?.num_partitions ?? null;

      let nodeCount = 0;
      let edgeCount = 0;

      const query_edges = panel.result?.graph?.edges ?? [];
      const query_nodes = panel.result?.graph?.nodes ?? [];

      nodeCount = query_nodes.length;
      edgeCount = query_edges.length;

      const partitionIds = [...new Set(query_nodes.map((node) => node.pid).filter((pid) => pid !== null && pid !== undefined))].sort(
        comparePartitionIds
      );
      const colorByPid = getPartitionColorMap(query_nodes);
      let cross_edges = query_edges.reduce((count, edge) => {
        return edge.isCross === true ? count + 1 : count;
      }, 0);

      return (
        <>
            <div className="query-container px-2" style={{ width: 'fit-content' }}>
              {panel.query}
            </div>

          <div className="panel-body">
            {/** Cluster information left top side mini legend */}

            {(for_partions || for_query_partitions) && (
              <div className="cluster-floating-legend">
                {/* Scrollable list of colors */}
                <div className="cluster-list">
                  {partitionIds.map((pid) => (
                    <div key={pid} className="cluster-pill">
                      <span className="cluster-label">Cluster {pid}</span>
                      <span className="cluster-color-bar" style={{ backgroundColor: colorByPid[String(pid)] }} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              id="remove-panel"
              onClick={() => handleRemovePanel(panel.id)}
              className="remove-panel"
              aria-label="Remove visualization"
            >
              <i className="ph ph-x"></i>
            </button>

            {/**Actual visualization of the graph in the panel */}
            {result?.kind === 'graph' && (
              <>
                <div className="graph-controls" id="graph-controls">
                  <button
                    type="button"
                    id="zoom-in"
                    className="floating-btn"
                    onClick={() => sigmaApisRef.current[panel.id]?.zoomIn?.()}
                    aria-label="Zoom in"
                  >
                    <i className="ph ph-plus"></i>
                  </button>

                  <button
                    type="button"
                    id="zoom-out"
                    className="floating-btn"
                    onClick={() => sigmaApisRef.current[panel.id]?.zoomOut?.()}
                    aria-label="Zoom out"
                  >
                    <i className="ph ph-minus"></i>
                  </button>

                  <button
                    type="button"
                    id="zoom-fit"
                    className="floating-btn"
                    onClick={() => sigmaApisRef.current[panel.id]?.zoomToFit?.()}
                    aria-label="Zoom to fit"
                  >
                    <i className="ph ph-arrows-out-cardinal"></i>
                  </button>

                  <button
                    type="button"
                    title="Export graph as PNG"
                    id="photo_export"
                    className="floating-btn"
                    aria-label="Photo export"
                    onClick={() =>
                      exportGraphWithOverlay(sigmaApisRef.current[panel.id]?.sigma, overlayRef_vis.current[panel.id], 'my-graph.png')
                    }
                  >
                    <i className="ph ph-download-simple"></i>
                  </button>
                </div>
                <div className="graph-container">
                  <GraphPanel
                    records={result}
                    maxNodes={maxNodes}
                    partition_colors={colorByPid}
                    sigmaApiRef={{
                      //When the GraphPanel sets its sigmaApiRef.current,store it under sigmaApisRef.current[panel.id]
                      get current() {
                        return sigmaApisRef.current[panel.id] ?? null;
                      },
                      set current(v) {
                        sigmaApisRef.current[panel.id] = v;
                      }
                    }}
                    overlayCanvasRef_Vis={{
                      get current() {
                        return overlayRef_vis.current[panel.id] ?? null;
                      },
                      set current(v) {
                        overlayRef_vis.current[panel.id] = v;
                      }
                    }}
                    selectedNodeId={selectedByPanel[panel.id] ?? null}
                    /**show only the neighbors of the clicked node*/
                    onSelectNode={(nodeId) => setSelectedByPanel((s) => ({ ...s, [panel.id]: nodeId }))}
                    /**Clear the graph selection without closing the inspector. */
                    onClearSelection={() => {
                      setSelectedByPanel((s) => ({ ...s, [panel.id]: null }));
                    }}
                    /* open your right inspector panel when clicking a node */
                    onGraphNodeClick={(nodeBundle) => {
                      setActivePanelId(panel.id);
                      setInspector((prev) => ({ ...prev, open: true, node: nodeBundle, panelId: panel.id }));
                    }}
                    onGraphStageClick={() => {
                      setActivePanelId(panel.id);
                      setInspector((prev) => {
                        if (prev.panelId !== panel.id || !prev.node) return prev;

                        return {
                          ...prev,
                          node: null
                        };
                      });
                    }}
                  />
                </div>

                {/* ...STATISTICS after graph-container ... */}
                {for_partions ? (
                  <div className="mt-1 pt-1 border-top border-secondary bg-opacity-10">
                    <div className="px-3">
                      <h6 className="text-uppercase fw-bold mb-2" style={{ fontSize: '11px', letterSpacing: '0.5px' }}>
                        Statistics
                      </h6>

                      <div className="row g-10 mb-2">
                        <div className="col">
                          <div className="card h-100 border-0 shadow-sm text-center py-2">
                            <div className="card-body p-1">
                              <p className="mb-1 text-secondary fw-medium" style={{ fontSize: '10px' }}>
                                Clustrers
                              </p>
                              <h3 className="fw-bold mb-0">{how_many_clusters}</h3>
                            </div>
                          </div>
                        </div>

                        <div className="col">
                          <div className="card h-100 border-0 shadow-sm text-center py-2">
                            <div className="card-body p-1">
                              <p className="mb-1 text-secondary fw-medium" style={{ fontSize: '10px' }}>
                                Total Nodes
                              </p>
                              <h3 className="fw-bold mb-0">{nodeCount}</h3>
                            </div>
                          </div>
                        </div>

                        <div className="col">
                          <div className="card h-100 border-0 shadow-sm text-center py-2">
                            <div className="card-body p-1">
                              <p className="mb-1 text-secondary fw-medium" style={{ fontSize: '10px' }}>
                                Total Edges
                              </p>
                              <h3 className="fw-bold mb-0">{edgeCount}</h3>
                            </div>
                          </div>
                        </div>

                        <div className="col">
                          <div className="card h-100 border-0 shadow-sm text-center py-2">
                            <div className="card-body p-1">
                              <p className="mb-1 text-secondary fw-medium" style={{ fontSize: '10px' }}>
                                Total Cross-Edges
                              </p>
                              <h3 className="fw-bold mb-0 text-danger">{cross_edges}</h3>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-1 pt-1 border-top border-secondary bg-opacity-10">
                    <div className="px-3">
                      <h6 className="text-uppercase fw-bold mb-2" style={{ fontSize: '11px', letterSpacing: '0.5px' }}>
                        Statistics
                      </h6>

                      <div className="row g-2 mb-2">
                        <div className="col-4">
                          <div className="card h-100 border-0 shadow-sm text-center py-2">
                            <div className="card-body p-1">
                              <p className="mb-1 text-secondary fw-medium" style={{ fontSize: '10px' }}>
                                Total Nodes
                              </p>
                              <h3 className="fw-bold mb-0">{nodeCount}</h3>
                            </div>
                          </div>
                        </div>
                        <div className="col-4">
                          <div className="card h-100 border-0 shadow-sm text-center py-2">
                            <div className="card-body p-1">
                              <p className="mb-1 text-secondary fw-medium" style={{ fontSize: '10px' }}>
                                Total Edges
                              </p>
                              <h3 className="fw-bold mb-0 text-dark">{edgeCount}</h3>
                            </div>
                          </div>
                        </div>
                        {for_query_partitions && (
                          <div className="col">
                            <div className="card h-100 border-0 shadow-sm text-center py-2">
                              <div className="card-body p-1">
                                <p className="mb-1 text-secondary fw-medium" style={{ fontSize: '10px', lineHeight: '1.1' }}>
                                  Total Cross-Edges
                                </p>
                                <h3 className="fw-bold mb-0" style={{ color: '#dc3545' }}>
                                  {cross_edges}
                                </h3>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/** Table result visualization in the panels - for query table results */}
            {result?.kind === 'table' && (
              <>
                <div className="table-scroll-area">
                  <div className="table-content">
                    <TableResult result={result} maxRows={20} />
                  </div>
                </div>
                {result?.table?.rows.length > 0 && (
                  <div className="table-footer">
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '18px' // space between text and button
                      }}
                    >
                      <span>To inspect all the results:</span>
                      <ExportCsvButton result={result} filename="properties.csv" />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      );
    }
  };

  const handlePartitions = async (e) => {
    if (clusterRequestInFlightRef.current) return;

    clusterRequestInFlightRef.current = true;
    setLoadingClusters(true);

    const shouldRefresh = refreshCL;
    let graphpanelId = null;

    try {
      const query = `

        UNWIND $pids AS pid
        WITH DISTINCT pid

        CALL (pid) {

            MATCH (n)
            WHERE n.pid = pid

            WITH n, pid,

                COUNT {
                    (n)<--()
                } AS inDegree,

                COUNT {
                    (n)--(other)
                    WHERE other.pid IN $pids
                      AND other.pid <> pid
                } AS crossDegree

            WHERE crossDegree > 0

            ORDER BY
                inDegree DESC,
                crossDegree DESC,
                elementId(n)

            LIMIT $perPidNodes

            RETURN
                n AS seed,
                inDegree,
                crossDegree
        }

        WITH collect(DISTINCT seed) AS selectedNodes

        UNWIND selectedNodes AS a

        OPTIONAL MATCH (a)-[r]-(b)
        WHERE b IN selectedNodes
          AND elementId(a) < elementId(b)

        RETURN a, r, b;`;

      graphpanelId = addPanel(query);
      setActivePanelId(graphpanelId);

      const partitionData = await fetchPartitions({
        conn_id: connectionID,
        refresh: shouldRefresh
      });

      const records = partitionData.records;

      // This takes 'table' out and puts everything else into 'graphOnlyRecords'
      const graphOnlyRecords = { ...records };
      delete graphOnlyRecords.table;

      console.log(graphOnlyRecords);
      console.log(connectionID);

      updatePanel(graphpanelId, {
        status: 'success',
        result: graphOnlyRecords
      });

      // Let React/Sigma commit and paint the graph before starting the more
      // expensive statistics query. The statistics endpoint only warms the
      // backend cache; the inspector reads the result stored on this panel.
      await waitForCanvasPaint();
      try {
        const partitionStatsData = await fetchPartitionsStats({
          conn_id: connectionID,
          refresh: shouldRefresh
        });

        updatePanel(graphpanelId, {
          partitionStats: partitionStatsData?.records ?? []
        });
      } catch (statsError) {
        console.error('Partition statistics warm-up failed:', statsError);
      }

    } catch (err) {
      if (graphpanelId) {
        updatePanel(graphpanelId, {
          status: 'error',
          error: err
        });
      }

      const errorDetail = err.response?.data?.detail || err.message;
      console.log(errorDetail);
    } finally {
      setRefreshCL(false);
      setLoadingClusters(false);
      clusterRequestInFlightRef.current = false;
    }
  };

  const handleRemovePanel = (panelId) => {
    // clear any selection that might trigger reducers/refresh
    setSelectedByPanel((s) => {
      const next = { ...s };
      delete next[panelId];
      return next;
    });

    // drop sigma api reference BEFORE unmount
    delete sigmaApisRef.current[panelId];

    removePanel(panelId);
  };

  const requestDbRefresh = useCallback(() => {
    setRefreshCL(true);
  }, []);

  /** for observing what panel is mostly visible each moment to adapt accordingly the right InspectorDrawer */
  useEffect(() => {
    const observer = new IntersectionObserver(
      () => {
        const allPanels = Object.values(panelRefs.current);

        let bestPanelId = null;
        let bestVisibleHeight = 0;

        allPanels.forEach((el) => {
          if (!el) return;

          const rect = el.getBoundingClientRect();
          const viewportTop = 0;
          const viewportBottom = window.innerHeight;

          const visibleTop = Math.max(rect.top, viewportTop);
          const visibleBottom = Math.min(rect.bottom, viewportBottom);
          const visibleHeight = Math.max(0, visibleBottom - visibleTop);

          if (visibleHeight > bestVisibleHeight) {
            bestVisibleHeight = visibleHeight;
            bestPanelId = el.dataset.panelId;
            console.log(el.dataset);
          }
        });

        if (bestPanelId) {
          setActivePanelId(bestPanelId);
        }
      },
      {
        threshold: [0, 0.25, 0.5, 0.75, 1]
      }
    );

    Object.values(panelRefs.current).forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [panels, setActivePanelId]);

  useEffect(() => {
    setInspector((prev) => {
      if (!prev.open || !prev.node || !prev.panelId) return prev;
      if (panels.some((panel) => panel.id === prev.panelId)) return prev;

      return {
        ...prev,
        node: null,
        panelId: null
      };
    });
  }, [panels]);

  const activePanel = useMemo(() => {
    return panels.find((p) => p.id === activePanelId) || null;
  }, [panels, activePanelId]);

  useEffect(() => {
    if (noPid) {
      alert("⚠️ The features for visualiazing clusters are deactivated because no 'Pid' property was found in your database");
    }
  }, [noPid]);

  return (
    <MainCard bodyClassName="p-2 pt-3" style={{ width: '100%', height: '100%' }}>
      {!noPid && (
        <div className="d-flex flex-column gap-2">
          <div className="partition-controls pt-2">
            {/* Actions bar for the database */}
            <div className="d-flex align-items-center">
              <div className="actions">
                <div className="group" id="show-clusters">
                  <button
                    onClick={handlePartitions}
                    type="button"
                    disabled={loadingClusters}
                    className="btn-blue-gradient"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = '0 6px 24px rgba(21, 101, 192, 0.5)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = '0 4px 18px rgba(21, 101, 192, 0.35)';
                    }}
                  >
                    Show all clusters
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="d-flex align-items-center gap-2 px-2 py-1 rounded w-auto">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="#3B82F6" strokeWidth="2" />
          <text x="12" y="8" textAnchor="middle" fill="#3B82F6" fontSize="8" fontWeight="700" fontFamily="sans-serif">
            i
          </text>
          <rect x="11" y="10" width="2" height="7" rx="1" fill="#3B82F6" />
        </svg>

        <small className="fw-medium" style={{ color: '#3B82F6', letterSpacing: '0.01em' }}>
          Graph preview is limited to 1000 nodes per panel
        </small>
      </div>

      {/** panels loop */}
      {(panels.length === 0 && !hideWelcomePanel) ? (
          <div
            data-panel-id="welcome-panel"
            id="panel"
          >
            <div className="exploration-canvas-wrapper">
              <ExplorePage />
            </div>
          </div>
        ) : (
            panels.map((panel) => (
              <div
                key={panel.id}
                data-panel-id={panel.id} //panelId but with kabab-case
                id="panel"
                ref={(el) => {
                  if (el) {
                    panelRefs.current[panel.id] = el;
                  } else {
                    delete panelRefs.current[panel.id];
                  }
                }}
              >
                <div
                  style={{
                    height: 14,
                    backgroundColor: 'var(--bs-body-bg)',
                    padding: '5px 0'
                  }}
                />

                <div className="visualization-canvas-wrapper">{renderPanelBody(panel, maxNodes, sigmaApisRef)}</div>
              </div>
        ))
    )
  }

      {/* RIGHT: inspector (ONE instance only) */}
      <InspectorDrawer inspector={inspector} setInspector={setInspector} onRequestDbRefresh={requestDbRefresh} activePanel={activePanel} />
    </MainCard>
  );
}
