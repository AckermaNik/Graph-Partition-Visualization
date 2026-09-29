export const vis_steps = [
  {
    selector: '#db',
    content: (
      <div>
        <PageTitle />
        Click here to view your database's Technical Information
      </div>
    ),
    position: 'right'
  },
  {
    selector: '#saved-queries',
    content: (
      <div>
        <PageTitle />
        Click here to view your saved queries
      </div>
    ),
    position: 'right'
  },
  {
    selector: '#schema',
    content: (
      <div>
        <PageTitle />
        Click here to export a database schema of your whole graph
      </div>
    )
  },
  {
    selector: '#query-bar',
    content: (
      <div>
        <PageTitle />
        Insert your query for execution here. Multiple, administrative and write queries are not allowed
      </div>
    )
  },
  {
    selector: '#play-button',
    content: (
      <div>
        <PageTitle />
        Click this button or press "Enter" to start the query execution
      </div>
    )
  },
  {
    selector: '#save-query',
    content: (
      <div>
        <PageTitle />
        Click here to save the corresponding query
      </div>
    ),
    padding: 5
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
  },
  {
    selector: '#show-clusters',
    content: (
      <div>
        <PageTitle />
        Show the partition clusters that are formed from the current available partition data in your graph
      </div>
    )
  },
  {
    selector: '#plus-button',
    content: (
      <div>
        <PageTitle />
        Inspector with additional graph information/statistics depending on the graph panel you are viewing
        <br />
      </div>
    )
  }
];

// component
export function PageTitle({ title = 'Visualization Page', contents }) {
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <h1 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>{title}</h1>
      {contents && <p style={{ color: '#666', marginTop: '0.25rem' }}>{contents}</p>}
    </div>
  );
}
