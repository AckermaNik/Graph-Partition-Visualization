import { Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Heart } from '@phosphor-icons/react';

// react-bootstrap
import Form from 'react-bootstrap/Form';
import Nav from 'react-bootstrap/Nav';

// project-imports
import { handlerDrawerOpen, useGetMenuMaster } from '@/api/menu';
import { useAppState } from '@/context/useAppState';
import { isConnectionRecoveryError, runCypher } from '@/api/neo4j';
import { useConnectionID } from '@/api/connection';
import { saveSessionSavedQuery } from '@/api/sessionSavedQueries';

// =============================|| MAIN LAYOUT - HEADER ||============================== //

export default function Header() {
  const { menuMaster } = useGetMenuMaster();
  const drawerOpen = menuMaster?.isDashboardDrawerOpened;
  const location = useLocation();
  const isVisualization = location.pathname === '/visualization';

  const { addPanel, updatePanel, addTwoPanels, setActivePanelId } = useAppState();

  // show query ONLY on visualization AND only if all 3 are filled
  const shouldShowQueryBar = isVisualization;

  const [query, setQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingQuery, setIsSavingQuery] = useState(false);
  const [heartActive, setHeartActive] = useState(false);

  const connectionID = useConnectionID();

  const toggleFullscreen = (e) => {
    e.preventDefault();
    e.stopPropagation(); // important: prevent dropdown/toggle side effects

    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  const handleKeyDown = (e) => {
    // Check if Enter was pressed
    if (e.key === 'Enter') {
      // If they ARE NOT holding Shift, submit the form
      if (!e.shiftKey) {
        e.preventDefault(); // Prevents the textarea from adding a new line
        document.getElementById('query-form')?.requestSubmit();
      }
      // If they ARE holding Shift, it will just do a normal new line
    }
  };

  return (
    <header className="pc-header">
      <div className="header-wrapper">
        <div className=" pc-mob-drp">
          <Nav className="list-unstyled">
            <Nav.Item className="pc-h-item pc-sidebar-collapse">
              <Nav.Link
                as={Link}
                to="#"
                className="pc-head-link ms-0"
                id="sidebar-hide"
                onClick={() => {
                  handlerDrawerOpen(!drawerOpen);
                }}
              >
                <i className="ph ph-list" />
              </Nav.Link>
            </Nav.Item>

            <Nav.Item className="pc-h-item pc-sidebar-popup">
              <Nav.Link as={Link} to="#" className="pc-head-link ms-0" id="mobile-collapse" onClick={() => handlerDrawerOpen(!drawerOpen)}>
                <i className="ph ph-list" />
              </Nav.Link>
            </Nav.Item>
          </Nav>
        </div>

        {shouldShowQueryBar && (
          <div className="pc-header-search-fill mt-3">
            <Form
              id="query-form"
              onSubmit={async (e) => {
                e.preventDefault();

                const trimmedQuery = (query ?? '').trim();

                // Guard: Don't run if already loading or if query is empty
                if (isSubmitting || !trimmedQuery) return;

                // 1. BLOCK: Multiple Queries (Semicolons in the middle)
                // We strip the last semicolon first to doesn't trigger an error
                const cleanForCheck = trimmedQuery.replace(/\s*;+\s*$/, '');
                if (cleanForCheck.includes(';')) {
                  alert('❌ Multiple queries are not allowed');
                  return;
                }
                // 2. BLOCK: Write Operations
                const writeKeywords = /\b(CREATE|MERGE|DELETE|DETACH|SET|REMOVE|DROP)\b/i;
                if (writeKeywords.test(cleanForCheck)) {
                  alert('❌ Write queries are not allowed');
                  return;
                }

                const lowerQuery = cleanForCheck.toLowerCase();

                // 3. Relationship Returns
                // If they return a relationship variable but not the nodes
                // Matches "RETURN r" or "RETURN rel" but NOT "RETURN a, r, b
                // Logic: If it contains a relationship pattern like '-[r]->'

                const halfAnonymousRelPattern =
                  /(\(\s*\)\s*-\s*(\[[^\]]*\])?\s*[-<>]*\s*\(\s*[^)]*\))|(\(\s*[^)]*\)\s*-\s*(\[[^\]]*\])?\s*[-<>]*\s*\(\s*\))/i;

                const hasAnonymous = halfAnonymousRelPattern.test(lowerQuery);
                console.log(hasAnonymous);

                setIsSubmitting(true);

                // No connection → show error on the panel -NEVER FOR 99%
                if (!connectionID) {
                  alert('Missing connection. Please refresh page.', connectionID);
                  return;
                }

                try {
                  const data = await runCypher({
                    conn_id: connectionID,
                    query: cleanForCheck,
                    params: {},
                    anonymous: hasAnonymous
                  });

                  const records = data.records;

                  if (records.kind === 'graph') {
                    // This takes 'table' out and puts everything else into 'graphOnlyRecords'
                    const { table, ...graphOnlyRecords } = records;

                    //if we have both a graph and table as data
                    if (table && table.rows.length > 0) {
                      const [graphId, tableId] = addTwoPanels(cleanForCheck, graphOnlyRecords, table);
                      setActivePanelId(graphId);
                    } else {
                      // if we onlt have graph data and not a table
                      const graphpanelId = addPanel(cleanForCheck);
                      setActivePanelId(graphpanelId);

                      updatePanel(graphpanelId, {
                        status: 'success',
                        result: graphOnlyRecords
                      });
                    }
                  } else if (records.kind === 'table') {
                    const tablepanelId = addPanel(cleanForCheck);
                    setActivePanelId(tablepanelId);

                    updatePanel(tablepanelId, {
                      status: 'success',
                      result: records
                    });
                  }
                } catch (err) {
                  if (isConnectionRecoveryError(err)) return;
                  const errorDetail = err.response?.data?.detail || err.message;

                  if (errorDetail === 'Invalid or expired conn_id. Call /validate again.') {
                    alert('Session expired so please log in again');
                    window.location.href = '/';
                    return; // Stop here
                  }

                  alert('⚠️ Your query is malformed and more precisely : ' + errorDetail);
                } finally {
                  setIsSubmitting(false);
                  setQuery('');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }
              }}
            >
              <div className="pc-header-search-group">
                <div className="search-container-wrapper w-100">
                  <Form.Control
                    as="textarea"
                    id="query-bar"
                    placeholder="$ Neo4j 5.x Cypher:  (e.g MATCH (a)-[r]-(b) WHERE labels(a) <> labels(b) RETURN a, r, b LIMIT 12)"
                    value={query}
                    onKeyDown={handleKeyDown}
                    className="pc-header-search-input w-100"
                    onChange={(e) => setQuery(e.target.value)}
                    disabled={isSubmitting}
                  />

                  <button
                    type="button"
                    className="pc-search-play"
                    id="play-button"
                    disabled={isSubmitting || !query}
                    onClick={() => {
                      document.getElementById('query-form')?.requestSubmit();
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="40" height="40" fill="white">
                      <path d="M8 5v14l11-7z" />
                    </svg>{' '}
                  </button>
                </div>
              </div>
            </Form>

            {/* The Progress Bar sits right at the bottom edge of the header */}
            {isSubmitting && <div className="query-progress-bar" />}
          </div>
        )}

        <div className="ms-auto">
          <Nav className="list-unstyled align-items-center d-flex">
            {/* ❤️ Heart button — only active when query bar has content */}
            {isVisualization && (
              <Nav.Item className="pc-h-item">
                <Nav.Link
                  as="button"
                  id="save-query"
                  disabled={!query || isSavingQuery}
                  className="save-query-btn"
                  aria-label="Save query"
                  title="Save query"
                  onClick={async () => {

                    setHeartActive(true);
                    setTimeout(() => setHeartActive(false), 1000);

                    const queryToSave = (query ?? '').trim();
                    if (!queryToSave || isSavingQuery) return;

                    try {
                      setIsSavingQuery(true);
                      const data = saveSessionSavedQuery(queryToSave);
                      console.log('[SAVED_QUERIES] saved query:', data.saved_query);
                      console.log('[SAVED_QUERIES] first 3 queries:', data.queries?.slice(0, 3));
                    } catch (err) {
                      if (isConnectionRecoveryError(err)) return;
                      alert('Could not save query: ' + err.message);
                    } finally {
                      setIsSavingQuery(false);
                    }
                  }}
                >
                  <Heart
                    size={30}
                    weight={heartActive ? 'fill' : 'regular'}
                    className={`save-query-btn__icon ${heartActive ? 'save-query-btn__icon--active' : ''}`}
                  />
                </Nav.Link>
              </Nav.Item>
            )}

            {/* Fullscreen toggle */}
            <Nav.Item className="pc-h-item">
              <Nav.Link
                as={Link}
                id="toggle-full-screen"
                to="#"
                className="pc-head-link"
                onClick={toggleFullscreen}
                aria-label="Toggle fullscreen"
                title="Fullscreen"
              >
                <i className="ph ph-arrows-out header-fullscreen-icon" style={{ fontSize: '32px', lineHeight: 1 }} />
              </Nav.Link>
            </Nav.Item>
          </Nav>
        </div>
      </div>
    </header>
  );
}
