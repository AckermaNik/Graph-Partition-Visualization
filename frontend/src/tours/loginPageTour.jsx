export const login_steps = [
  {
    selector: '#neoURL',
    content: (
      <div>
        <PageTitle />
        Enter your Neo4j database connection URL
      </div>
    )
  },
  {
    selector: '#username',
    content: (
      <div>
        <PageTitle />
        Enter your Neo4j database name
      </div>
    )
  },
  {
    selector: '#password',
    content: (
      <div>
        <PageTitle />
        Enter your Neo4j database password
      </div>
    )
  },
  {
    selector: '#toggle-full-screen',
    content: (
      <div>
        <PageTitle />
        Extend the viewport to take up all the window capacity
      </div>
    ),
    padding: 5
  }
];

// component
export function PageTitle({ title = 'Database Login Page', contents }) {
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <h1 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>{title}</h1>
      {contents && <p style={{ color: '#666', marginTop: '0.25rem' }}>{contents}</p>}
    </div>
  );
}
