import { useLocation } from 'react-router-dom';
import { useTour } from '@reactour/tour';
import { useCallback, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Copy } from '@phosphor-icons/react';

//project imports
import { useMenuItems } from '@/menu-items/systemToolbar';
import NavItem from './NavItem';
import { vis_steps } from '@/tours/visualizationPageTour.jsx';
import { login_steps } from '@/tours/loginPageTour.jsx';
import { fetchSchema, isConnectionRecoveryError } from '@/api/neo4j';
import { useConnectionID } from '@/api/connection';
import { useAppState } from '@/context/useAppState';
import { restartExpl, databaseMetaData } from '@/api/neo4j';
import { useSavedQueries } from '@/api/savedQueries';

function SchemaOverlay({ status }) {
  if (status === 'idle') return null;

  return createPortal(
    <div className="schema-overlay">
      <div className="bg-white rounded-4 text-center p-5 shadow-lg schema-overlay__card">
        {/* top accent bar */}
        <div className={`schema-overlay__accent ${status === 'done' ? 'schema-overlay__accent--done' : ''}`} />

        {/* message */}
        <p className="text-muted mb-4" style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
          {status === 'done' ? 'Schema export complete' : 'Downloading database schema…'}
        </p>

        {/* loading spinner */}
        {status === 'loading' && (
          <div className="spinner-border text-primary" style={{ width: '3rem', height: '3rem' }} role="status">
            <span className="visually-hidden">Loading…</span>
          </div>
        )}

        {/* done state */}
        {status === 'done' && (
          <div>
            <div className="fw-semibold mb-3" style={{ fontSize: '1.85rem', color: '#198754', letterSpacing: '0.06em' }}>
              DONE
            </div>
            <svg width="80" height="80" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
              <circle cx="40" cy="40" r="34" fill="none" stroke="#198754" strokeWidth="3" />
              <polyline
                points="23,41 35,53 57,28"
                fill="none"
                stroke="#198754"
                strokeWidth="4.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

function DatabaseMetaOverlay({ status, onClose, onLoadingChange }) {
  const [meta, setMeta] = useState(null);
  const connectionID = useConnectionID();

  useEffect(() => {
    const fetchMeta = async () => {
      onLoadingChange?.(true);
      try {
        const res = await databaseMetaData({ conn_id: connectionID });
        setMeta(res);
      } catch (err) {
        if (isConnectionRecoveryError(err)) return;
        alert('Please try again.' + err);
      } finally {
        onLoadingChange?.(false);
      }
    };

    if (status === true) fetchMeta();
  }, [connectionID, onLoadingChange, status]);

  if (status === false || !meta) return null;

  return createPortal(
    <div className="db-meta-overlay" onClick={() => onClose?.()}>
      <div onClick={(e) => e.stopPropagation()} className="db-meta-overlay__card">
        {/* top accent */}
        <div className="db-meta-overlay__accent" />

        <h6 style={{ fontWeight: 600, marginBottom: 24, fontSize: '1rem', color: '#2d2d2d', textAlign: 'center' }}>
          Database Connection Info
        </h6>

        <div className="db-meta-overlay__rows">
          {[
            { label: 'URL', value: meta.url },
            { label: 'Database', value: meta.database },
            { label: 'Neo4j Version', value: meta.neo4j_version },
            { label: 'Edition', value: meta.edition }
          ].map(({ label, value }) => (
            <div key={label} className="db-meta-overlay__row">
              <span className="db-meta-overlay__label">{label}</span>

              {label === 'Edition' ? (
                <span
                  className={`db-meta-overlay__badge ${value === 'enterprise' ? 'db-meta-overlay__badge--enterprise' : 'db-meta-overlay__badge--community'}`}
                >
                  {value}
                </span>
              ) : (
                <span style={{ fontSize: '0.85rem', fontFamily: 'monospace', color: '#2d2d2d' }}>{value}</span>
              )}
            </div>
          ))}
        </div>

        {/* Go Back button */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button onClick={() => onClose?.()} className="db-meta-overlay__btn">
            Go Back
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function SavedQueriesOverlay({ status, onClose, onLoadingChange }) {
  const [copiedQueryId, setCopiedQueryId] = useState(null);
  const connectionID = useConnectionID();
  const { queries, error, isLoading: isLoadingQueries } = useSavedQueries(connectionID, status);

  useEffect(() => {
    onLoadingChange?.(isLoadingQueries);
  }, [isLoadingQueries, onLoadingChange]);

  useEffect(() => {
    if (error && !isConnectionRecoveryError(error)) {
      alert('Could not load saved queries. ' + error.message);
    }
  }, [error]);

  const handleCopy = async (query) => {
    try {
      await navigator.clipboard.writeText(query.query);
      setCopiedQueryId(query.id);
      setTimeout(() => setCopiedQueryId(null), 1200);
    } catch {
      alert('Could not copy query.');
    }
  };

  if (status === false) return null;

  return createPortal(
    <div className="db-meta-overlay" onClick={() => onClose?.()}>
      <div onClick={(e) => e.stopPropagation()} className=" saved-queries-overlay__card">
        <div className="db-meta-overlay__accent" />

        <h6 style={{ fontWeight: 600, fontSize: '1rem', color: '#2d2d2d', textAlign: 'center' }} className="my-4">
          Saved Queries
        </h6>

        <div className="saved-queries-overlay__rows">
          {isLoadingQueries && <div className="saved-queries-overlay__empty">Loading saved queries...</div>}

          {!isLoadingQueries && queries.length === 0 && <div className="saved-queries-overlay__empty">No saved queries yet</div>}

          {!isLoadingQueries &&
            queries.map((query) => (
              <div key={query.id} className=" saved-queries-overlay__row">
                <pre className="saved-queries-overlay__query">{query.query}</pre>

                <div className="saved-queries-overlay__actions">
                  <button
                    type="button"
                    className={copiedQueryId === query.id ? 'icon-copied' : 'saved-queries-overlay__icon-btn'}
                    onClick={() => handleCopy(query)}
                    aria-label="Copy query"
                    title="Copy query"
                  >
                    <Copy size={16} weight="bold" />
                  </button>

                </div>
              </div>
            ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center' }} className="py-3">
          <button onClick={() => onClose?.()} className="db-meta-overlay__btn">
            Go Back
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function Navigation() {
  const menuItems = useMenuItems();
  const { setSteps, setIsOpen, setCurrentStep } = useTour();
  const location = useLocation();
  const isLoading = location.pathname === '/loading';
  const isWelcome = location.pathname === '/';
  const isInfo = location.pathname === '/app/information';
  const isVisualization = location.pathname === '/visualization';
  const isExploration = location.pathname === '/exploring';

  const navigate = useNavigate();
  const connectionID = useConnectionID();

  const [schemaStatus, setSchemaStatus] = useState('idle');
  const [isRestarting, setIsRestarting] = useState(false);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);
  const [isLoadingSavedQueries, setIsLoadingSavedQueries] = useState(false);
  const [showMeta, setShowMeta] = useState(false);
  const [showSavedQueries, setShowSavedQueries] = useState(false);

  const { addPanel, updatePanel, setActivePanelId, removeAllPanels } = useAppState();

  const handleSchemaExport = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setSchemaStatus('loading');

    try {
      const resp = await fetchSchema({ conn_id: connectionID, refresh: true });
      const blob = await resp.blob();
      const cd = resp.headers.get('Content-Disposition') || '';
      const m = cd.match(/filename="([^"]+)"/i);
      const filename = m?.[1] || 'schema.csv';

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setSchemaStatus('done');
      setTimeout(() => setSchemaStatus('idle'), 2500);
    } catch (err) {
      if (isConnectionRecoveryError(err)) return;
      setSchemaStatus('idle');
      alert("Couldn't compute database schema");
    }
  };

  const handleGuideClick = () => {
    const default_steps = !!document.querySelector('#upload-zone') ? login_and_upload_steps : login_steps;
    openTour(isVisualization ? vis_steps : default_steps);
  };

  const openTour = useCallback(
    (nextSteps) => {
      setIsOpen(false);
      setSteps([]);
      setCurrentStep(0);
      requestAnimationFrame(() => {
        setSteps(nextSteps);
        setCurrentStep(0);
        setIsOpen(true);
      });
    },
    [setIsOpen, setSteps, setCurrentStep]
  );

  const handleReset = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    setIsRestarting(true);
    removeAllPanels();
    try {
      const graphpanelId = addPanel('MATCH (a)-[r]-(b) WHERE elementId(a) < elementId(b) AND labels(a) <> labels(b) RETURN a, r, b LIMIT 12 ');
      setActivePanelId(graphpanelId);
      const res = await restartExpl({ conn_id: connectionID });
      const records = res.records;
      const { table, ...graphOnlyRecords } = records;
      graphOnlyRecords.partitions = false;

      updatePanel(graphpanelId, {
        status: 'success',
        result: graphOnlyRecords
      });

      navigate('/visualization');
    } catch (err) {
      if (isConnectionRecoveryError(err)) return;
      navigate('/');
      alert('Please try again.');
    } finally {
      setIsRestarting(false);
    }
  };

  const handleDatabaseMetaData = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setShowMeta(true);
  };

  const handleSavedQueries = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setShowSavedQueries(true);
  };

  return (
    <>
      <DatabaseMetaOverlay status={showMeta} onClose={() => setShowMeta(false)} onLoadingChange={setIsLoadingMetadata} />
      <SavedQueriesOverlay
        status={showSavedQueries}
        onClose={() => setShowSavedQueries(false)}
        onLoadingChange={setIsLoadingSavedQueries}
      />
      <SchemaOverlay status={schemaStatus} />

      <ul className="pc-navbar">
        {menuItems.map((item) => {
          if (item.id === 'schema') return <NavItem key={item.id} item={item} onClick={handleSchemaExport} disabled={schemaStatus === 'loading'} />;
          if (item.id === 'restart') return <NavItem key={item.id} item={item} onClick={handleReset} disabled={isRestarting} />;
          if (item.id === 'db') return <NavItem key={item.id} item={item} onClick={handleDatabaseMetaData} disabled={isLoadingMetadata} />;
          if (item.id === 'saved-queries') return <NavItem key={item.id} item={item} onClick={handleSavedQueries} disabled={isLoadingSavedQueries} />;

          if (item.id === 'new-pr') {
            return <NavItem id={item.id} key={item.id} item={item} />;
          }

          if (item.id === 'info') {
            return <NavItem id={item.id} key={item.id} item={item} />;
          }

          if (item.id === 'guide') {
            const navItem = { ...item, hidden: isLoading || isInfo || isWelcome || isExploration };
            return (
              <NavItem
                id={navItem.id}
                key={navItem.id}
                item={navItem}
                onClick={(e) => {
                  e.preventDefault();
                  handleGuideClick();
                }}
              />
            );
          }

          return <NavItem id={item.id} key={item.id} item={item} />;
        })}
      </ul>
    </>
  );
}
