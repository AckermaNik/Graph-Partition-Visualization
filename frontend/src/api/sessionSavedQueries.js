const storageKey = 'session_saved_queries';
const maxSavedQueries = 50;
let memoryQueries = [];

export function getSessionSavedQueries() {
  try {
    const saved = sessionStorage.getItem(storageKey);
    const queries = saved ? JSON.parse(saved) : [];
    return Array.isArray(queries) ? queries : memoryQueries;
  } catch {
    return memoryQueries;
  }
}

export function saveSessionSavedQuery(query) {
  const normalizedQuery = query.trim();
  const savedQuery = {
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    query: normalizedQuery,
    saved_at: Math.floor(Date.now() / 1000)
  };

  const queries = [savedQuery, ...getSessionSavedQueries().filter((item) => item.query !== normalizedQuery)].slice(0, maxSavedQueries);
  memoryQueries = queries;

  try {
    sessionStorage.setItem(storageKey, JSON.stringify(queries));
  } catch {
    // Keep the current tab's in-memory list if sessionStorage is unavailable.
  }

  return { saved_query: savedQuery, queries };
}
