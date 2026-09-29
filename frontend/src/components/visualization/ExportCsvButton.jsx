export default function ExportCsvButton({ result, filename = 'properties.csv' }) {
  const columns = result?.table?.columns ?? [];
  const rows = result?.table?.rows ?? [];

  const escapeCsv = (v) => {

    if (v === null || v === undefined) return '';
    let s = v;
    if (typeof v === 'object') {
      try {
        s = JSON.stringify(v);
      } catch {
        s = String(v);
      }
    } else {
      s = String(v);
    }

    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const exportCsv = () => {
    const csvText = columns.map(escapeCsv).join(',') + '\n' + rows.map((r) => r.map(escapeCsv).join(',')).join('\n');

    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button type="button" className='btn-blue-gradient' onClick={exportCsv}>
      Export CSV
    </button>
  );
}
