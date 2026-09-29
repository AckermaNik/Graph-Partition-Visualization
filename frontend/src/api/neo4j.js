/**
 *
 *  Frontend API helpers
 */

const INVALID_CONNECTION_DETAIL = 'Invalid or expired conn_id. Call /validate again.';
let recoveringConnection = false;

export class ConnectionRecoveryError extends Error {
  constructor() {
    super('Connection recovery in progress.');
    this.name = 'ConnectionRecoveryError';
    this.isConnectionRecovery = true;
  }
}

export function isConnectionRecoveryError(error) {
  return error?.isConnectionRecovery === true;
}

function isValidationRequest(url) {
  return String(url).split('?')[0].endsWith('/validate');
}

function isRecoveryRoute() {
  return typeof window === 'undefined' || ['/', '/loading', '/login'].includes(window.location.pathname);
}

function beginConnectionRecovery() {
  if (isRecoveryRoute() || recoveringConnection) {
    return recoveringConnection;
  }

  recoveringConnection = true;
  try {
    sessionStorage.removeItem('connection_id');
  } catch {
    // Recovery still works when browser storage is unavailable.
  }

  window.location.replace('/loading');
  return true;
}

function shouldRecoverFromResponse(response, url) {
  if (isValidationRequest(url)) return false;
  if (response.status >= 500) return true;

  if (response.status === 401) {
    return response
      .clone()
      .json()
      .then((data) => data.detail === INVALID_CONNECTION_DETAIL)
      .catch(() => false);
  }

  return false;
}

async function fetch(url, options) {
  try {
    const response = await globalThis.fetch(url, options);
    const shouldRecover = await shouldRecoverFromResponse(response, url);

    if (shouldRecover && beginConnectionRecovery()) {
      throw new ConnectionRecoveryError();
    }

    return response;
  } catch (error) {
    if (isConnectionRecoveryError(error)) throw error;

    if (!isValidationRequest(url) && beginConnectionRecovery()) {
      throw new ConnectionRecoveryError();
    }

    throw error;
  }
}

export async function validateNeo4jConnection(connection) {
  const res = await fetch(`${import.meta.env.VITE_API_URL}/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(connection)
  });

  const responseText = await res.text();
  let data = {};

  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error(`Backend returned an invalid response (${res.status}).`);
    }
  }

  if (!res.ok) {
    throw new Error(data.detail || `Database connection failed (${res.status} from ${res.url}).`);
  }

  if (!data.conn_id) {
    throw new Error('Backend returned an empty connection response.');
  }

  return data;
}

export async function fetchDataBaseInfos(connection_infos) {
  const res = await fetch(`${import.meta.env.VITE_API_URL}/schema`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(connection_infos)
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Schema fetch failed (${res.status})`);
  }

  return res.json();
}

export async function fetchSchema(connection_infos) {
  const resp = await fetch(`${import.meta.env.VITE_API_URL}/schema/export`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/csv'
    },
    body: JSON.stringify(connection_infos)
  });

  if (!resp.ok) {
    const msg = await resp.text().catch(() => '');
    throw new Error(msg || `Export failed (${resp.status})`);
  }

  return resp;
}

export async function runCypher({ conn_id, query, params, anonymous }) {
  const res = await fetch(`${import.meta.env.VITE_API_URL}/cypher`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conn_id, query, params, anonymous })
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.detail || 'Cypher request failed');
  }
  return data;
}

export async function saveSavedQuery({ conn_id, query }) {
  const res = await fetch(`${import.meta.env.VITE_API_URL}/saved-queries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conn_id, query })
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.detail || 'Save query request failed');
  }
  return data;
}

export async function fetchSavedQueries({ conn_id }) {
  const params = new URLSearchParams({
    conn_id
  });

  const res = await fetch(`${import.meta.env.VITE_API_URL}/saved-queries?${params.toString()}`);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.detail || 'Saved queries fetch failed');
  }
  return data;
}

export async function deleteSavedQuery({ conn_id, query_id }) {
  const res = await fetch(`${import.meta.env.VITE_API_URL}/saved-queries`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conn_id, query_id })
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.detail || 'Delete saved query request failed');
  }
  return data;
}

export async function fetchRefresh(connection_infos) {
  const res = await fetch(`${import.meta.env.VITE_API_URL}/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(connection_infos)
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.detail || 'Backend Refresh failed');
  }
  return data;
}

export async function fetchNodeData({ node_id, conn_id }) {
  const res = await fetch(
    `${import.meta.env.VITE_API_URL}/node/${encodeURIComponent(node_id)}/data?conn_id=${encodeURIComponent(conn_id)}`
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Node data fetching failed: ${res.status} ${text}`);
  }

  return res.json(); // [{type, count}, ...]
}

export async function fetchPartitions({ conn_id, refresh }) {
  const params = new URLSearchParams({
    conn_id,
    ...(refresh !== undefined && { refresh })
  });

  const res = await fetch(`${import.meta.env.VITE_API_URL}/partition-graph?${params.toString()}`);

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.detail || 'Backend Refresh failed');
  }
  return data;
}

export async function fetchPartitionsStats({ conn_id, refresh }) {
  const params = new URLSearchParams({
    conn_id,
    ...(refresh !== undefined && { refresh })
  });

  const res = await fetch(`${import.meta.env.VITE_API_URL}/partitions/stats?${params.toString()}`);

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.detail || 'Backend Refresh failed');
  }
  return data;
}

export async function initCaches({ conn_id }) {
  const params = new URLSearchParams({
    conn_id
  });

  const res = await fetch(`${import.meta.env.VITE_API_URL}/caches?${params.toString()}`);

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.detail || 'Backend Refresh failed');
  }
  return data;
}

export async function restartExpl({ conn_id }) {
  const params = new URLSearchParams({
    conn_id
  });

  const res = await fetch(`${import.meta.env.VITE_API_URL}/restart?${params.toString()}`);

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.detail || 'Backend Refresh failed');
  }
  return data;
}

export async function databaseMetaData({ conn_id }) {
  const params = new URLSearchParams({
    conn_id
  });

  const res = await fetch(`${import.meta.env.VITE_API_URL}/database-metadata?${params.toString()}`);

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.detail || 'Backend Refresh failed');
  }
  return data;
}
