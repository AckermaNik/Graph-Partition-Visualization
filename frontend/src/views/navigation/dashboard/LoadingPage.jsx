import MainCard from '@/components/MainCard';
import Spinner from 'react-bootstrap/Spinner';
import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

// project imports
import { initCaches, validateNeo4jConnection } from '@/api/neo4j';
import { useAppState } from '@/context/useAppState';
import { getConnectionDetails, setConnectionDetails, setConnectionID } from '@/api/connection';

export default function LoadingPage() {
  const navigate = useNavigate();
  const hasStarted = useRef(false);
  const retryTimer = useRef(null);

  const { addPanel, removeAllPanels, updatePanel, setActivePanelId } = useAppState();

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    const run = async () => {
      let noPid;
      const savedConnection = getConnectionDetails();
      const connectionDetails = savedConnection ?? {
        url: '',
        username: '',
        password: ''
      };

      try {
        const connection = await validateNeo4jConnection(connectionDetails);
        const activeConnectionID = connection.conn_id;
        setConnectionDetails(connectionDetails);
        setConnectionID(activeConnectionID);

        removeAllPanels();
        const graphpanelId = addPanel('MATCH (a)-[r]-(b) WHERE elementId(a) < elementId(b) AND labels(a) <> labels(b) RETURN a, r, b LIMIT 12 ');
        setActivePanelId(graphpanelId);
        const res = await initCaches({ conn_id: activeConnectionID });
        const records = res.records;
        noPid = res.noPid;
        const { table, ...graphOnlyRecords } = records;
        graphOnlyRecords.partitions = false; //mini hack

        updatePanel(graphpanelId, {
          status: 'success',
          result: graphOnlyRecords
        });

        navigate('/visualization', { state: { noPid: noPid } });
      } catch (err) {
        console.log(err);
        if (savedConnection) {
          retryTimer.current = window.setTimeout(() => window.location.replace('/loading'), 1500);
        } else {
          navigate('/login', { replace: true });
        }
      }
    };

    run();

    return () => {
      if (retryTimer.current) window.clearTimeout(retryTimer.current);
    };
  }, [addPanel, navigate, removeAllPanels, setActivePanelId, updatePanel]);

  return (
    <MainCard style={{ width: '100%', height: '100vh' }}>
      <div
        className="spinner"
        style={{
          marginTop: 100
        }}
      >
        <h2 className="fw-bold">Please wait while we fetch your data</h2>

        <p style={{ fontSize: '0.95rem', color: '#555' }}>Afterwards you will be redirected to the visualization page</p>

        <Spinner animation="border" role="status" style={{ width: '7rem', height: '7rem' }}>
          <span className="visually-hidden">Loading...</span>
        </Spinner>
      </div>
    </MainCard>
  );
}
