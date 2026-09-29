export default function TableResult({ result, maxRows = 20 }) {
  const columns = result?.table?.columns ?? [];
  const rows = result?.table?.rows ?? [];
  const total = result?.table?.count ?? rows.length;

  const visibleRows = rows.slice(0, maxRows);

  if (!columns.length) return <div className="text-muted p-2">No data.</div>;

  return (
    <div style={{ minWidth: 'max-content', padding: 10 }}>
      <small className="text-muted d-block mb-2">
        Showing {Math.min(maxRows, total)} of {total}
      </small>

      <table className="table table-hover table-sm align-middle mb-0">
        <thead className="table-light sticky-top">
          <tr>
            {columns.map((c) => (
              <th key={c} className="text-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row, i) => (
            <tr key={i}>
              {columns.map((_, j) => (
                <td key={j} className="text-nowrap">
                  {renderCell(row?.[j])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const renderCell = (value) => {
  if (value === null || value === undefined) return <span className="text-muted">null</span>;

  // primitives are fine
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  // dates
  if (value instanceof Date) return value.toISOString();

  // arrays/objects -> stringify (safe)
  try {
    return <span style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(value, null, 2)}</span>;
  } catch {
    return String(value);
  }
};
