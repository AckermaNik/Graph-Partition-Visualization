import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import ListGroup from 'react-bootstrap/ListGroup';
import MainCard from '@/components/MainCard';

//images
import graph from '@/assets/images/graph.jpg';
import cluster_query from '@/assets/images/cluster_query.jpg';
import controls from '@/assets/images/controls.jpg';
import tour from '@/assets/images/tour.jpg';
import first from '@/assets/images/first.jpg';
import schema from '@/assets/images/schema.jpg';
import vis from '@/assets/images/vis.jpg';
import new_user from '@/assets/images/newuser.jpg';
import user from '@/assets/images/user.jpg';
import clusters from '@/assets/images/clusters.jpg';
import inspector from '@/assets/images/inspector.jpg';
import inspector_ex from '@/assets/images/inspector_ex.jpg';
import cluster_inspector from '@/assets/images/clusterIn.jpg';
import node from '@/assets/images/node.jpg';
import query from '@/assets/images/query.jpg';
import table from '@/assets/images/table.jpg';
import vis_tour from '@/assets/images/vis_tour.jpg';

const A = ({ href, children }) => (
  <a href={href} target="_blank" rel="noopener noreferrer">
    {children}
  </a>
);

export default function AppInfo() {
  return (
    <MainCard title="User Guide and Techinal Documentation" bodyClassName="p-0" style={{ width: '100%', height: '100%' }}>
      <div className="p-4">
        <Row className="g-4">
          <Col xs={12}>
            <section className="mb-4 p-3 border rounded bg-light">
              <h2 className="fw-bold mb-3">Getting Started</h2>
              <ListGroup variant="flush">
                <ListGroup.Item className="px-0">
                  <ol className="mt-2 mb-0">
                    <li className="mb-2">
                      In order to visualize partitions and make queries for data in your database it is <strong>mandatory</strong> to do the
                      following:
                      <ul className="mt-2">
                        <li>
                          Have your <A href="https://neo4j.com/">Neo4j</A> database up and running
                        </li>
                        <li>
                          Fill <strong>all</strong> <A href="https://neo4j.com/">Neo4j</A> connection fields:
                          <ul className="mt-2">
                            <li>
                              Your local or aura database link including the protocol you use (<code>bolt</code> or <code>neo4j</code>)
                            </li>
                            <li>The name of your database instance</li>
                            <li>Your database password</li>
                          </ul>
                        </li>
                      </ul>
                    </li>

                    <li>
                      In general it is recommended to have the property responsible for partiions as an{' '}
                      <strong>integer and not a string</strong> and to <strong> index that property key </strong> because it speeds up the
                      searching proccess
                    </li>

                    <li>
                      After <strong>8 hours of inactivity</strong>, an alert will prompt the user to log in again. This is done to maintain app performance and keep the account secure.
                    </li>
                  </ol>
                </ListGroup.Item>

                <ListGroup.Item className="px-4">
                  Afterwards press the <strong>"Start"</strong> button that will be appeared and the after your data are loaded the
                  visualization page will be presented to you
                </ListGroup.Item>
              </ListGroup>
              <div className="text-center my-3">
                <img src={user} alt="Login page" className="img-fluid" style={{ maxWidth: '100%', height: 'auto' }} />
              </div>
            </section>
          </Col>

          <Col xs={12}>
            <section className="mb-4 p-3 border rounded bg-light">
              <h2 className="fw-bold mb-3">Quick page tour</h2>
              <p>
                Either you are in the a login page or in the visualization one, you can quickly see and understand what features each page
                has by clicking the book icon in the left menu:{' '}
              </p>
              <div className="text-center my-3">
                <img src={tour} alt="Pop up tour guides" className="img-fluid" style={{ maxWidth: '100%', height: 'auto' }} />
              </div>
            </section>
          </Col>

          <Col xs={12}>
            <section className="mb-4 p-3 border rounded bg-light">
              <h2 className="fw-bold mb-3">Visualization Page</h2>
              <p>The page you will see after the loading proccess is finished is the visualization one with an example query graph: </p>
              <div className="text-center my-3">
                <img src={vis} alt="Visualization Page" className="img-fluid" style={{ maxWidth: '100%', height: 'auto' }} />
              </div>
            </section>
          </Col>

          <Col xs={12}>
            <section className="mb-4 p-3 border rounded bg-light">
              <h2 className="fw-bold mb-3">Toolbar Menu</h2>
              <p className="mb-0">
                On the left side of the visualization page you will see a sliding menu with many items and more presicely:{' '}
              </p>
              <ListGroup variant="flush">
                <ListGroup.Item className="px-0">
                  <ol className="mt-2 mb-0">
                    <li className="mb-2">
                      Press the database icon (first one) to see technical information about the database instance you use:
                      <div className="text-center my-3">
                        <img src={first} alt="Database menu icon" className="img-fluid" style={{ maxWidth: '100%', height: 'auto' }} />
                      </div>
                    </li>

                    <li className="mb-2">
                      Press the plus icon (second one) to start a new browser session as a new project and you will be redirected in the
                      login page:
                      <div className="text-center my-3">
                        <img src={user} alt="Login page" className="img-fluid" style={{ maxWidth: '100%', height: 'auto' }} />
                      </div>
                    </li>

                    <li>
                      Press the graph icon (third one) to make a fresh start for your exploration and all the panels you have will be
                      deleted showing you again an example panel as a reference:
                      <div className="text-center my-3">
                        <img src={vis} alt="Refreshed page" className="img-fluid" style={{ maxWidth: '100%', height: 'auto' }} />
                      </div>
                    </li>

                    <li>
                      Press the information icon (forth one) to be redirected in this page for User guidance and Technical documentation
                    </li>

                    <li>
                      Press the book icon (fifth one) to start a quick visualization page tour to make a better understanding of the app's
                      features:
                      <div className="text-center my-3">
                        <img src={vis_tour} alt="Refreshed page" className="img-fluid" style={{ maxWidth: '100%', height: 'auto' }} />
                      </div>
                    </li>

                    <li>
                      Press the download icon (sixth one) to export a database schema of your graph data as .csv file:
                      <div className="text-center my-3">
                        <img src={schema} alt="Database schema" className="img-fluid" style={{ maxWidth: '100%', height: 'auto' }} />
                      </div>
                    </li>
                  </ol>
                </ListGroup.Item>
              </ListGroup>
            </section>
          </Col>

          <Col xs={12}>
            <section className="mb-4 p-3 border rounded bg-light">
              <h2 className="fw-bold mb-3">Database Refresh and General Information</h2>
              <p>To refresh the database instance you use after making any changes and to inspect general database information such as:</p>
              <ul>
                <li>
                  Total count of nodes and all node labels present in the database, along with their assigned colors for visualization
                </li>
                <li>Total count of relationships and all relationship types present in the database</li>
              </ul>
              <p className="mb-0">
                Click the blue <strong>+</strong> symbol at the top right of the viewport and the{' '}
                <strong> Refresh Database and All graph </strong> buttons will appear to you
              </p>
              <div className="text-center my-3">
                <img src={inspector_ex} alt="Inpector example" className="img-fluid" style={{ maxWidth: '100%', height: 'auto' }} />
              </div>
              <div className="text-center my-3">
                <img src={inspector} alt="Inpector information" className="img-fluid" style={{ maxWidth: '100%', height: 'auto' }} />
              </div>
            </section>
          </Col>

          <Col xs={12}>
            <section className="mb-4 p-3 border rounded bg-light">
              <h2 className="fw-bold mb-3">Graph Partition Visualization</h2>
              <p>
                To see <strong>all</strong> partition clusters and their global statistics, press the "Show all clusters" button
              </p>
              <p>
                In each cluster, the app displays the ten most influential nodes according to their maximum incoming crossing-edge degree,
                which highlights cross-partition authorities. These nodes also happen to have some sampled crossing edges with nodes from
                other partitions. (If a partition has no crossing edges, or if two nodes have the same incoming crossing-edge count, then
                nodes are selected according to their maximum global incoming edge degree.)
              </p>
              <p className="mb-0">
                When you are in clusters' panel by pressing blue + symbol at the top right of the viewport, you can inspect each cluster's
                statistics such as:
              </p>
              <ul>
                <li>Total count of nodes in each cluster</li>
                <li>Total count of crossing relationships in each cluster</li>
                <li>Total sum of each cluster's node properties (Cost)</li>
                <li> ... </li>
              </ul>
              <div className="text-center my-3">
                <img src={clusters} alt="Show cluster button" className="img-fluid" style={{ maxWidth: '100%', height: 'auto' }} />
              </div>
              <div className="text-center my-3">
                <img src={cluster_inspector} alt="Cluster Information" className="img-fluid" style={{ maxWidth: '100%', height: 'auto' }} />
              </div>
            </section>
          </Col>

          <Col xs={12}>
            <section className="mb-4 p-3 border rounded bg-light">
              <h2 className="fw-bold mb-3">Graph Visualization Details</h2>
              <p>
                The default node limit for visualizing nodes and their corresponding relationships is <strong>1000 nodes per panel</strong>
              </p>
              <p className="mb-3">
                You can <strong>zoom in, zoom out, shrink to fit, and save as PNG the current state of the graph</strong> by pressing the
                corresponding buttons at the top right of the panel:
              </p>
              <div className="text-center my-3">
                <img src={controls} alt="Clicked node details" className="img-fluid" style={{ maxWidth: '100%', height: 'auto' }} />
              </div>
              <p>
                Also, by <strong>clicking a graph node</strong>, valuable information about that node will be presented to you
              </p>
              <div className="text-center my-3">
                <img src={node} alt="Clicked node details" className="img-fluid" style={{ maxWidth: '100%', height: 'auto' }} />
              </div>
            </section>
          </Col>

          <Col xs={12}>
            <section className="mb-4 p-3 border rounded bg-light">
              <h2 className="fw-bold mb-3">Cypher Query Execution</h2>
              <p>
                To execute Cypher querries insert your query in the bar located at the top of the viewport and then press{' '}
                <strong>Enter</strong> or the <strong>"Play" button end of the bar</strong>
              </p>

              <ul>
                <li>
                  Read-only querries are allowed <strong>only</strong>
                </li>
                <li>
                  Administrative querries are <strong>not</strong> allowed{' '}
                </li>
                <li>
                  Multiple querries are <strong>not</strong> allowed{' '}
                </li>
                <li>
                  If the query does not include a <code>LIMIT</code> predicate, a default limit of <strong>100 records</strong> is applied
                </li>
                <li>
                  If you make a query about your partitions by accessing your partition id property of nodes, then the output ones are
                  clustered according to their partition id you querried, to help you distinguish the clusters they belong to:
                  <div className="text-center my-3">
                    <img src={query} alt="Query Bar" className="img-fluid" style={{ maxWidth: '100%', height: 'auto' }} />
                  </div>
                  <div className="text-center my-3">
                    <img src={cluster_query} alt="Query for Clusters" className="img-fluid" style={{ maxWidth: '100%', height: 'auto' }} />
                  </div>
                </li>
              </ul>
              <p className="mb-0">
                After execution, your graph and/or table results will appear in the panel. Table results are limited to a preview of{' '}
                <strong>10 rows</strong> but you can download the full returned table as a <code>.csv</code> file by pressing the{' '}
                <strong>"Download"</strong> button beyond the table's records in the panel
              </p>
              <div className="text-center my-3">
                <img src={table} alt="Query table" className="img-fluid" style={{ maxWidth: '100%', height: 'auto' }} />
              </div>
            </section>
          </Col>

          {/* Technical Documentation */}
          <Col xs={12}>
            <section className="mb-4 p-3 border rounded bg-light">
              <h2 className="fw-bold mb-3">Technical Documentation </h2>
              <p>
                This application is a{' '}
                <strong>
                  <A href="https://react.dev/">React</A> + <A href="https://vitejs.dev/">Vite</A>
                </strong>{' '}
                frontend with a{' '}
                <strong>
                  <A href="https://fastapi.tiangolo.com/">FastAPI</A> backend{' '}
                </strong>
                designed for graph partition and query visualization and analysis using a{' '}
                <strong>
                  <A href="https://neo4j.com/">Neo4j</A> graph database
                </strong>
              </p>
              <p className="mb-0">
                The system allows users to visualize graph partitions, inspect cluster characteristics, execute read-only Cypher queries,
                and explore graph data interactively
              </p>
            </section>
          </Col>

          {/* Technology Stack */}
          <Col xs={12}>
            <section className="mb-4 p-3 border rounded bg-light">
              <h2 className="fw-bold mb-3">Technology Stack</h2>

              <h5 className="fw-semibold">Frontend</h5>
              <ul>
                <li>
                  <A href="https://react.dev/">React 19</A>
                </li>
                <li>
                  <A href="https://vitejs.dev/">Vite</A>
                </li>
                <li>
                  <A href="https://getbootstrap.com/">Bootstrap 5</A>
                </li>
                <li>
                  <A href="https://react-bootstrap.github.io/">React-Bootstrap</A>
                </li>
              </ul>

              <h5 className="fw-semibold">Graph Visualization</h5>
              <ul>
                <li>
                  <A href="https://www.sigmajs.org/">Sigma.js</A> <strong>v3</strong>
                </li>
                <li>
                  <A href="https://graphology.github.io/">Graphology</A>
                </li>
                <li>
                  <A href="https://graphology.github.io/standard-library/layout-forceatlas2">ForceAtlas2 Layout</A>
                </li>
                <li>
                  <A href="https://graphology.github.io/standard-library/layout-noverlap">Noverlap Layout</A>
                </li>
                <li>
                  <A href="https://d3js.org/">D3 Utilities</A>
                </li>
              </ul>

              <h5 className="fw-semibold">Backend</h5>
              <ul>
                <li>
                  <A href="https://www.python.org/">Python</A>
                </li>
                <li>
                  <A href="https://fastapi.tiangolo.com/">FastAPI</A>
                </li>
                <li>
                  <A href="https://www.uvicorn.org/">Uvicorn</A>
                </li>
              </ul>

              <h5 className="fw-semibold mb-0">Database</h5>
              <ul className="mb-0">
                <li>
                  <A href="https://neo4j.com/">Neo4j 5.x</A>
                </li>
              </ul>
            </section>
          </Col>

          {/* Version Requirements */}
          <Col xs={12}>
            <section className="mb-4 p-3 border rounded bg-light">
              <h2 className="fw-bold mb-3">Version Requirements</h2>

              <ul className="mb-0">
                <li>
                  <strong>
                    <A href="https://nodejs.org/en"> Node.js:</A>
                  </strong>
                  v24.13.0 or later
                </li>
                <li>
                  <strong>
                    <A href="https://neo4j.com/">Neo4j</A>:
                  </strong>{' '}
                  5.26.2 or later
                </li>
              </ul>

              <p className="mt-3 mb-0">
                The application requires a{' '}
                <strong>
                  <A href="https://neo4j.com/">Neo4j 5.x instance</A>
                </strong>{' '}
                because the database integration and driver functionality are implemented for Neo4j version 5. Earlier versions are not
                supported
              </p>
            </section>
          </Col>

          {/* Frontend Startup */}
          <Col xs={12}>
            <section className="mb-4 p-3 border rounded bg-light">
              <h2 className="fw-bold mb-3">Frontend Startup</h2>

              <p>
                The web interface is built with{' '}
                <strong>
                  <A href="https://vitejs.dev/">Vite</A>
                </strong>
                . To start the frontend server:
              </p>

              <pre className="bg-dark text-light p-3 rounded">
                {`cd app
npm start`}
              </pre>

              <p className="mb-0">This launches the development server and makes the application accessible through the browser</p>
            </section>
          </Col>

          {/* Backend Startup */}
          <Col xs={12}>
            <section className="mb-4 p-3 border rounded bg-light">
              <h2 className="fw-bold mb-3">Backend Startup (FastAPI)</h2>

              <p>
                The backend server is implemented using{' '}
                <strong>
                  <A href="https://fastapi.tiangolo.com/">FastAPI</A>
                </strong>{' '}
                and served with{' '}
                <strong>
                  <A href="https://www.uvicorn.org/">Uvicorn</A>
                </strong>
              </p>

              <p>
                Running the backend inside a <strong>Python virtual environment is strongly recommended </strong>
                in order to isolate dependencies and avoid conflicts with system Python packages
              </p>

              <h6 className="fw-semibold">Windows</h6>

              <pre className="bg-dark text-light p-3 rounded">
                {`cd app
.venv\\Scripts\\activate
python -u -m uvicorn backend.main:app`}
              </pre>

              <h6 className="fw-semibold">Debian / Linux</h6>

              <pre className="bg-dark text-light p-3 rounded">
                {`cd app
source .venv/bin/activate
python -u -m uvicorn backend.main:app`}
              </pre>

              <p className="mb-0">
                During development you may optionally add the <code>--reload</code> flag to automatically restart the server when code
                changes
              </p>
            </section>
          </Col>

          {/* Database Requirements */}
          <Col xs={12}>
            <section className="mb-4 p-3 border rounded bg-light">
              <h2 className="fw-bold mb-3">Database Requirements</h2>

              <p>
                The application requires access to a{' '}
                <strong>
                  {' '}
                  running <A href="https://neo4j.com/">Neo4j</A> database instance{' '}
                </strong>{' '}
                and the property responsible for partiions must be <strong>an integer and not a string</strong>
              </p>

              <p>The following connection parameters must be provided:</p>

              <ul>
                <li>
                  Database URI including protocol (<code>bolt://</code> or <code>neo4j://</code>)
                </li>
                <li>Database name</li>
                <li>Database password</li>
              </ul>

              <p className="mb-0">
                {' '}
                Moreover is <strong>recommended</strong> to index that property key because it speeds up the searching proccess
              </p>
            </section>
          </Col>

          {/* Core Frontend Packages */}
          <Col xs={12}>
            <section className="mb-4 p-3 border rounded bg-light">
              <h2 className="fw-bold mb-3">Core Frontend Packages</h2>

              <h6 className="fw-semibold">Core Framework</h6>
              <ul>
                <li>
                  <A href="https://react.dev/">react</A>
                </li>
                <li>
                  <A href="https://react.dev/">react-dom</A>
                </li>
                <li>
                  <A href="https://vitejs.dev/">vite</A>
                </li>
                <li>
                  <A href="https://reactrouter.com/">react-router</A>
                </li>
                <li>
                  <A href="https://reactrouter.com/">react-router-dom</A>
                </li>
              </ul>

              <h6 className="fw-semibold">UI and Styling</h6>
              <ul>
                <li>
                  <A href="https://getbootstrap.com/">bootstrap</A>
                </li>
                <li>
                  <A href="https://react-bootstrap.github.io/">react-bootstrap</A>
                </li>
                <li>
                  <A href="https://sass-lang.com/">sass</A>
                </li>
                <li>
                  <A href="https://github.com/Grsmto/simplebar">simplebar-react</A>
                </li>
              </ul>

              <h6 className="fw-semibold">Graph Visualization</h6>
              <ul>
                <li>
                  <A href="https://sim51.github.io/react-sigma/">@react-sigma/core</A>
                </li>
                <li>
                  <A href="https://www.sigmajs.org/">sigma (v3)</A>
                </li>
                <li>
                  <A href="https://graphology.github.io/">graphology</A>
                </li>
                <li>
                  <A href="https://graphology.github.io/standard-library/layout-forceatlas2">graphology-layout-forceatlas2</A>
                </li>
                <li>
                  <A href="https://graphology.github.io/standard-library/layout-noverlap">graphology-layout-noverlap</A>
                </li>
                <li>
                  <A href="https://d3js.org/">d3-polygon</A>
                </li>
              </ul>

              <h6 className="fw-semibold mb-0">Forms and Data Handling</h6>
              <ul className="mb-0">
                <li>
                  <A href="https://formik.org/">formik</A>
                </li>
                <li>
                  <A href="https://react-hook-form.com/">react-hook-form</A>
                </li>
                <li>
                  <A href="https://github.com/jquense/yup">yup</A>
                </li>
                <li>
                  <A href="https://swr.vercel.app/">swr</A>
                </li>
                <li>
                  <A href="https://reactour.js.org/">reactour-tour</A>
                </li>
              </ul>
            </section>
          </Col>
        </Row>
      </div>
    </MainCard>
  );
}
