// react
import { useMemo, useRef, useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { EyeIcon } from '@phosphor-icons/react';

// react-bootstrap
import Alert from 'react-bootstrap/Alert';
import Form from 'react-bootstrap/Form';
import InputGroup from 'react-bootstrap/InputGroup';
import { Button, Stack, Container, Row, Col } from 'react-bootstrap';

// project-imports
import { setConnectionDetails, setConnectionID } from '@/api/connection';
import { validateNeo4jConnection } from '@/api/neo4j';
// ================================|| DASHBOARD - DEFAULT ||============================== //

export default function LoginPage() {
  const scrollRef = useRef(null);
  const navigate = useNavigate();

  //[value, setter function]
  const [isDragging, setIsDragging] = useState(false); //useState → how the UI reacts to invalid input
  const [error, setError] = useState('');
  const [connectError, setConnectError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showStartButton, setShowStartButton] = useState(false);
  const [urlConnection, setUrlConnection] = useState('');
  const [nameConnection, setNameConnection] = useState('');
  const [passwordConnection, setPasswordConnection] = useState('');

  const [nodes, setNodes] = useState([]);
  const [relations, setRelations] = useState([]);
  const [partitions, setPartitions] = useState([]);

  const { allFilled, partial } = useMemo(() => {
    //The "memoization" part means React will only re-calculate these boolean values if the connection object changes
    const urlEmpty = !urlConnection.trim();
    const userEmpty = !nameConnection.trim();
    const passEmpty = !passwordConnection.trim();

    const allEmptyLocal = urlEmpty && userEmpty && passEmpty;
    const allFilledLocal = !urlEmpty && !userEmpty && !passEmpty;
    const partialLocal = !allEmptyLocal && !allFilledLocal; // if a field is typed but not all throw error

    return { allFilled: allFilledLocal, partial: partialLocal };
  }, [nameConnection, passwordConnection, urlConnection]);

  useEffect(() => {
    if (allFilled) {
      setConnectError('');
      setShowStartButton(true);
    } else {
      setShowStartButton(false);
    }
  }, [allFilled]);


  const goVisualization = async () => {
    setConnectError('');
    setShowStartButton(false);

    const connection = {
      username: nameConnection,
      password: passwordConnection,
      url: urlConnection
    };

    try {
      const res = await validateNeo4jConnection(connection);
      setConnectionDetails(connection);
      setConnectionID(res.conn_id);
    } catch (err) {
      console.log(err.message);
      if (err.message.includes('Neo.ClientError.Security.Unauthorized')) {
        setConnectError('Failed to connect to database. Check again your credentials');
      } else {
        setConnectError(err.message || 'Failed to connect to the database.');
      }
      setShowStartButton(true);
      return; // block navigation
    }

    navigate('/loading');
  };

  //secondary header
  const connectionFields_vertical = (
    <Stack direction="vertical" gap={3}>
      <Form.Group>
        <Form.Label style={{ fontSize: '0.78rem', color: '#717171', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Database URL
        </Form.Label>
        <Form.Control
          id="neoURL"
          size="sm"
          className="db-conn-input"
          placeholder="bolt://4.223.67.60:7687"
          value={urlConnection}
          onChange={(e) => setUrlConnection(e.target.value)}
          required
        />
        <p className="mt-2 text-muted small">Ensure every node has a "cid" property to enable partition features</p>
      </Form.Group>

      <Form.Group>
        <Form.Label style={{ fontSize: '0.78rem', color: '#717171', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Username
        </Form.Label>
        <Form.Control
          id="username"
          className="db-conn-input"
          size="sm"
          placeholder="neo4j"
          value={nameConnection}
          onChange={(e) => setNameConnection(e.target.value)}
          required
        />
      </Form.Group>

      <Form.Group>
        <Form.Label style={{ fontSize: '0.78rem', color: '#717171', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Password
        </Form.Label>
        <InputGroup size="sm">
          <Form.Control
            id="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Enter password"
            className="db-conn-input"
            value={passwordConnection}
            onChange={(e) => setPasswordConnection(e.target.value)}
            required
          />
          <div className="db-eye">
            <Button className="db-conn-input db-eye" onClick={() => setShowPassword((prev) => !prev)}>
              <EyeIcon size={14} weight="bold" />
            </Button>
          </div>
        </InputGroup>
      </Form.Group>
    </Stack>
  );

  return (
    <div className="login-page-wrapper">
      <div className="d-flex flex-column align-items-center">
        {/* Title */}
        <div className="mb-4 mt-2 text-center">
          <h4 className="login-section__title">Welcome to GraphPG </h4>
        </div>

        <div className="login-section__card">
          <h5 style={{ fontSize: '1rem', color: '#717171', marginBottom: 10, textAlign: 'center' }}>Neo4j connection:</h5>
          {connectionFields_vertical}
          {showStartButton && (
            <div className="mt-4 d-flex justify-content-center" ref={scrollRef}>
              <button onClick={goVisualization} disabled={partial} className="btn-blue-gradient">
                Start
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12h14M13 6l6 6-6 6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          )}
          {connectError && (
        <Alert variant="danger" className="mt-3 mb-3">
          {connectError}
        </Alert>
      )}

      {error && (
        <Alert variant="danger" className="mt-3 mb-3">
          {error}
        </Alert>
      )}
        </div>
      </div>
    </div>
  );
}
