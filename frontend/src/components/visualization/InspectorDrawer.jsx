import React, { useMemo, useEffect, useState, useCallback } from 'react';
import Button from 'react-bootstrap/Button';
import { PlusIcon } from '@phosphor-icons/react';
import Spinner from 'react-bootstrap/Spinner';

//project imports
import { fetchDataBaseInfos, fetchSchema, fetchRefresh, isConnectionRecoveryError } from '@/api/neo4j';
import { useConnectionID } from '@/api/connection';

const DRAWER_WIDTH = 340;

export default function InspectorDrawer({ inspector, setInspector, onRequestDbRefresh, activePanel }) {
  const open = !!inspector?.open;
  const node = inspector?.node;
  const for_partitions = activePanel?.result?.partitions || false;
  const for_query = activePanel?.query || '';
  const prefetchedPartitionStats = activePanel?.partitionStats;

  const [showNodeData, setshowNodeData] = useState(false);
  const [showClusterData, setshowClusterData] = useState(false);
  const [showQueryData, setshowQueryData] = useState(false);

  const connectionID = useConnectionID();

  const [clusterStats, setClusterStats] = useState(null);
  const [refreshClStats, setRefreshClStats] = useState(false);

  const [queryNodeCount, setQueryNodeCount] = useState(0);
  const [queryEdgeCount, setQueryEdgeCount] = useState(0);
  const [queryNodeLabelCounts, setQueryNodeLabelCounts] = useState({});
  const [queryEdgeTypeCounts, setQueryEdgeTypeCounts] = useState({});
  const [queryNodeColors, setQueryNodeColors] = useState({});

  // local schema/metadata state (ONLY used here)
  const [dbData, setDbData] = useState(() => {
    try {
      const saved = sessionStorage.getItem('db_metadata_cache');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [dbStatus, setDbStatus] = useState('idle'); // idle | loading | success | error
  const [dbError, setDbError] = useState(null);

  const [showTick, setShowTick] = useState(false);
  const [refreshDB, setRefreshDB] = useState(false);
  const [showDataInfo, setshowDataInfo] = useState(false);

  const title = useMemo(() => {
    if (showNodeData) return 'Node Inspector';
    else if (showDataInfo) return 'All graph';
    else if (showClusterData) return 'Cluster Inspector';
    else if (showQueryData != '') return 'Current graph';
    return 'General';
  }, [showNodeData, showDataInfo, showClusterData, showQueryData]);

  const loadDbInfo = useCallback(
    async ({ refresh }) => {
      setDbStatus('loading');
      setDbError(null);
      try {
        const data = await fetchDataBaseInfos({ conn_id: connectionID, refresh });
        setDbStatus('success');
        setDbData(data);
        sessionStorage.setItem('db_metadata_cache', JSON.stringify(data));
        return data;
      } catch (err) {
        if (isConnectionRecoveryError(err)) return;
        setDbStatus('error');
        setDbError(err?.message || String(err));
        throw err;
      }
    },
    [connectionID]
  );

  const handleToggleDb = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    setshowDataInfo(true);

    await loadDbInfo({ refresh: refreshDB });
    setRefreshDB(false);
  };

  const handleOnRefresh = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    setRefreshDB(true);
    setRefreshClStats(true);

    // tell Visualization to refresh its DB-derived widgets
    onRequestDbRefresh?.();
    try {
      await fetchRefresh({ conn_id: connectionID, refresh: true });
    } catch (err) {
      if (isConnectionRecoveryError(err)) return;
      console.log(err);
    }
    setShowTick(true);
    const timer = setTimeout(() => setShowTick(false), 2000);
    return () => clearTimeout(timer);
  };

  const handleInspectorClick = (e) => {
    e.preventDefault();
    e.stopPropagation();

    setInspector((prev) => ({
      ...prev,
      open: !prev.open
    }));
  };

  /** Effect for 'Show all Clusters' Information - Statistics for each cluster */
  useEffect(() => {
    const loadPartitionStats = () => {
      if (!for_partitions || !open) return;

      setshowDataInfo(false);
      setshowQueryData(false);

      //inspector.panelId  is tied to the panel that the user clicked a node to see its details
      if (node && inspector.panelId === activePanel?.id) {
        setshowNodeData(true);
        return;
      }
      setshowNodeData(false);
      setshowClusterData(true);
      if (Array.isArray(prefetchedPartitionStats)) {
        setClusterStats(prefetchedPartitionStats);
      } else {
        // Do not carry statistics over from a different panel while the
        // current panel's statistics are still being prepared.
        setClusterStats(null);
      }
      setRefreshClStats(false);
    };

    loadPartitionStats();
  }, [activePanel?.id, connectionID, for_partitions, inspector.panelId, node, open, prefetchedPartitionStats, refreshClStats]);

  /** Effect for Current graph Information - general query graph information */
  useEffect(() => {
    if (for_partitions || !for_query || !open) {
      setQueryNodeCount(0);
      setQueryEdgeCount(0);
      setQueryNodeLabelCounts({});
      setQueryEdgeTypeCounts({});
      setQueryNodeColors({});
      return;
    }

    setshowDataInfo(false);
    setshowClusterData(false);
    // console.log('for query:' + for_query);
    console.log(inspector.panelId + '======' + activePanel?.id);

    //inspector.panelId  is tied to the panel that the user clicked a node to see its details
    if (node && inspector.panelId === activePanel?.id) {
      setshowNodeData(true);
      return;
    }
    setshowNodeData(false);
    setshowQueryData(true);

    const query_edges = activePanel?.result?.graph?.edges ?? [];
    const query_nodes = activePanel?.result?.graph?.nodes ?? [];

    const nodeCount = query_nodes.length;
    const edgeCount = query_edges.length;

    const nodeLabelCounts = query_nodes.reduce((acc, node) => {
      const label = node.label;
      if (!label) return acc;
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    }, {});

    const edgeTypeCounts = query_edges.reduce((acc, edge) => {
      const label = edge.label;
      if (!label) return acc;
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    }, {});

    const nodeColors = query_nodes.reduce((acc, node) => {
      const label = node.label;
      if (!label) return acc;
      if (!acc[label]) {
        acc[label] = node.color || '#1b8e7c';
      }
      return acc;
    }, {});

    setQueryNodeCount(nodeCount);
    setQueryEdgeCount(edgeCount);
    setQueryNodeLabelCounts(nodeLabelCounts);
    setQueryEdgeTypeCounts(edgeTypeCounts);
    setQueryNodeColors(nodeColors);
  }, [
    activePanel?.id,
    activePanel?.result?.graph?.edges,
    activePanel?.result?.graph?.nodes,
    for_partitions,
    for_query,
    inspector.panelId,
    node,
    open
  ]);

  /** Effect for showing Node information if a node is selected */
  useEffect(() => {
    if (node) {
      setshowDataInfo(false);
      setshowNodeData(true);
      setshowClusterData(false);
      setshowQueryData(false);
    }
  }, [node]);

  const formatNumber = (val) => {
    if (typeof val !== 'number') return val;
    return val.toLocaleString('de-DE'); // gives 1.000 style
  };

  const excludedKeys = new Set(['id', 'element_id', 'size', 'color', 'isCross', 'fake_type']);

  const dataEntries = useMemo(() => {
    return Object.entries(node?.attrs?.data ?? {});
  }, [node]);

  const CrossingSummaryTable = ({ crossingSummary, formatNumber }) => {
    const sorted = [...crossingSummary].sort((a, b) => b.edgeCount - a.edgeCount);
    const max = sorted[0]?.edgeCount ?? 1;

    return (
      <div style={{ display: 'inline-block' }} className="py-2 px-3">
        {/* This wrapper creates the specific outer rounded box from your image.
        overflow: 'hidden' ensures the table corners don't poke out of the rounded borders.
      */}
        <div
          style={{
            border: '1px solid rgba(255, 255, 255, 0.3)',
            borderRadius: '0px',
            overflow: 'hidden',
            marginLeft:5
          }}
        >
          <table style={{ width: '100%', color: '#ffffff' }}>
            <thead>
              <tr>
                <th
                  style={{
                    padding: '10px 16px',
                    textAlign: 'left',
                    color: '#a0a0a0',
                    fontWeight: 'normal',
                    fontSize: '13px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.3)',
                    borderRight: '1px solid rgba(255, 255, 255, 0.6)' // The top part of the center line
                  }}
                >
                  Clusters
                </th>
                <th
                  style={{
                    padding: '10px 16px',
                    textAlign: 'right',
                    color: '#a0a0a0',
                    fontWeight: 'normal',
                    fontSize: '13px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.3)'
                  }}
                >
                  Cross Relations
                </th>
              </tr>
            </thead>

            <tbody>
              {sorted.map((item, idx) => {
                const pct = Math.round((item.edgeCount / max) * 100);
                const isLast = idx === sorted.length - 1;
                const rowBorder = isLast ? 'none' : '1px solid rgba(255, 255, 255, 0.3)';

                return (
                  <tr key={item.otherPid}>
                    <td
                      style={{
                        padding: '8px 16px',
                        borderBottom: rowBorder,
                        borderRight: '1px solid rgba(255, 255, 255, 0.6)' // The rest of the center line
                      }}
                    >
                      <span style={{ fontSize: 13 }}>Cluster {item.otherPid}</span>
                    </td>
                    <td
                      style={{
                        padding: '8px 16px',
                        borderBottom: rowBorder,
                        textAlign: 'right',
                        fontWeight: 500,
                        fontVariantNumeric: 'tabular-nums'
                      }}
                    >
                      {formatNumber(item.edgeCount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Fixed “purple handle” */}
      <button
        type="button"
        id="plus-button"
        onClick={handleInspectorClick}
        aria-label="Toggle inspector drawer"
        className="inspector__handle"
        style={{ right: open ? DRAWER_WIDTH : 0 }} // dynamic
      >
        <PlusIcon size={32} />
      </button>

      {/* Sliding drawer */}
      <div
        role="dialog"
        aria-label="Right inspector drawer"
        className={`inspector__drawer ${open ? 'is-open' : ''}`}
      >
        {/* Header */}
        <div className="inspector__header">
          <div className="inspector__title">{title}</div>

          <div className="inspector__headerActions">
            <button
              type="button"
              onClick={() => {
                setInspector((prev) => ({ ...prev, open: false }));
              }}
              className="inspector__closeBtn"
              aria-label="Close drawer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="inspector__body">
          <div className="inspector__dbTopRow gap-3">
            {showTick ? (
              <span className="inspector__updated">&#10003; Updated</span>
            ) : (
              <button className="btn-blue-gradient" onClick={handleOnRefresh}>
                Refresh Database
              </button>
            )}

            <button className="btn-blue-gradient" onClick={handleToggleDb}>
              All graph
            </button>
          </div>

          {showDataInfo ? (
            <div className="inspector__dbWrap">
              <div className="inspector__scrollArea">
                {dbStatus === 'loading' && (
                  <div className="spinner">
                    <Spinner animation="border" role="status" style={{ width: '7rem', height: '7rem' }}>
                      <span className="visually-hidden">Loading...</span>
                    </Spinner>
                  </div>
                )}

                {dbStatus === 'error' && <div className="inspector__statusText">Failed to load metadata: {dbError}</div>}

                {dbStatus === 'success' && dbData && (
                  <div className="inspector__section">
                    <div>
                      <div className="inspector__sectionTitle">Nodes ({formatNumber(dbData.nodeCount)})</div>

                      <div className="inspector__chipRow">
                        {(dbData.nodeLabels || []).map((l) => (
                          <span
                            key={l}
                            className="inspector__chip"
                            style={{ backgroundColor: dbData.colors?.[l] || '#1b8e7c' }} // dynamic per label
                          >
                            {l} ({formatNumber(dbData.nodeLabelCounts?.[l] ?? 0)})
                          </span>
                        ))}
                      </div>
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <div className="inspector__sectionTitle">Relationships ({formatNumber(dbData.relationshipCount)})</div>

                      <div className="inspector__chipRow">
                        {(dbData.relationshipTypes || []).map((t) => (
                          <span key={t} className="inspector__chip inspector__chip--rel">
                            {t} ({formatNumber(dbData.relTypeCounts?.[t] ?? 0)})
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : showNodeData && node != null ? (
            <div className="inspector__nodeView">
              <div className="inspector__h">Node ({node?.attrs?.shortLabel})</div>
              <div className="inspector__subText">
                <div>
                  <b>Label:</b> {node.attrs?.displayLabel}
                </div>
              </div>
              <div className="inspector__h">Properties</div>

              <div className="inspector__propsBox">
                {dataEntries
                  .filter(([key]) => {
                    if (excludedKeys.has(key)) return false;

                    return true;
                  })
                  .map(([key, value]) => (
                    <div key={key} className="inspector__kvRow">
                      <span className="inspector__kvKey">{key}:</span> <span className="inspector__kvVal">{String(value)}</span>
                    </div>
                  ))}
              </div>
              <div className="inspector__h" style={{ marginTop: 12 }}>
                Relationship types in current graph ({node.distinctRels?.length || 0})
              </div>
              <div className="inspector__list">
                {(node.distinctRels ?? []).map((r) => {
                  const { type, source, target, ...displayProps } = r.attrs?.data ?? {};
                  const hasExtraProps = Object.entries(displayProps).filter(([key]) => !excludedKeys.has(key)).length > 0;
                  return (
                    <div key={r.id} className="inspector__card">
                      <div className="inspector__relTitle">
                        {r.type} ({node.relCounts?.get?.(r.type) || 0})
                      </div>

                      <div className="inspector__relMeta">
                        {r.source} → {r.target}
                      </div>

                      <div className="inspector__kvKey" style={{ paddingTop: 30 }}>
                        Properties:
                      </div>
                      {hasExtraProps ? (
                        <>
                          <div className="inspector__cardDivider">
                            {Object.entries(displayProps)
                              .filter(([key]) => !excludedKeys.has(key))
                              .map(([key, value]) => (
                                <div key={key} className="inspector__kvRow">
                                  <span className="inspector__kvKey" style={{ paddingLeft: 10, paddingTop: 0 }}>
                                    {key}
                                  </span>
                                  <span className="inspector__kvVal">{String(value)}</span>
                                </div>
                              ))}
                          </div>
                        </>
                      ) : (
                        <div className="inspector__kvRow" style={{ color: 'white', opacity: 0.6 }}>
                          None
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="inspector__h" style={{ marginTop: 12 }}>
                Relationship types globally ({node.globalrels?.length || 0})
              </div>
              <div className="inspector__list">
                {(node.globalrels ?? []).map((r, i) => {
                  const sourceLabel = r.direction === 'out' ? r.selfLabel : r.otherLabel;
                  const targetLabel = r.direction === 'out' ? r.otherLabel : r.selfLabel;

                  return (
                    <div key={`${sourceLabel}-${r.type}-${targetLabel}-${i}`} className="inspector__card inspector__globalRow">
                      <div className="inspector__relTitle">
                        {r.type} ({r.count || 0})
                      </div>

                      <div className="inspector__relMeta">
                        {sourceLabel} → {targetLabel}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : showClusterData ? (
            <div className="inspector__nodeView">
              {clusterStats == null ? (
                <div className="spinner">
                  <Spinner animation="border" role="status" style={{ width: '7rem', height: '7rem' }}>
                    <span className="visually-hidden">Loading...</span>
                  </Spinner>
                </div>
              ) : (
                <>
                  <p style={{ textAlign: 'center', paddingTop: 20 }} className="inspector__h">
                    Cluster Statistics Globally
                  </p>

                  {clusterStats?.map((cluster) => {
                    const { pid, crossingSummary, ...rest } = cluster;
                    const dataEntries = Object.entries(rest);

                    return (
                      <div key={pid} className="inspector__clusterBlock">
                        <div className="inspector__h">
                          <b>Cluster {pid}</b>
                        </div>

                        <div className="inspector__propsBoxClusters">
                          {dataEntries.map(([key, value]) => (
                            <div key={key} className="inspector__kvRow">
                              <span className="inspector__kvKey">{key}</span>
                              <span className="inspector__kvValCl">{formatNumber(value)}</span>
                            </div>
                          ))}

                          <div className="inspector__kvRow pt-4">
                            <span className="inspector__kvKey">Incoming / outgoing relations with : </span>
                          </div>

                          {(crossingSummary || []).length > 0 ? (
                            CrossingSummaryTable({ crossingSummary, formatNumber })
                          ) : (
                            <div className="inspector__kvRow" style={{ color: 'white', opacity: 0.6 }}>
                              No clusters
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          ) : showQueryData ? (
            <div className="inspector__section">
              <div>
                <div className="inspector__sectionTitle">Nodes ({formatNumber(queryNodeCount)})</div>

                <div className="inspector__chipRow">
                  {Object.entries(queryNodeLabelCounts).map(([label, count]) => (
                    <span
                      key={label}
                      className="inspector__chip"
                      style={{
                        backgroundColor: queryNodeColors[label] || '#1b8e7c'
                      }}
                    >
                      {label} ({formatNumber(count)})
                    </span>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <div className="inspector__sectionTitle">Relationships ({formatNumber(queryEdgeCount)})</div>

                <div className="inspector__chipRow">
                  {Object.entries(queryEdgeTypeCounts).map(([type, count]) => (
                    <span key={type} className="inspector__chip inspector__chip--rel">
                      {type} ({formatNumber(count)})
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
