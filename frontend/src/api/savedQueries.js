import useSWR from 'swr';

import { fetchSavedQueries } from './neo4j';

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

function mergeQueries(sessionQueries, sharedQueries) {
  const sessionQueryText = new Set(sessionQueries.map((query) => query.query));

  return [...sessionQueries, ...sharedQueries.filter((query) => !sessionQueryText.has(query.query))];
}

export function useSavedQueries(connectionID, enabled = true) {

  //SWR passes that entire array to the fetcher
  // null tells SWR that the request is disabled.
  const key = enabled && connectionID ? ['saved-queries', connectionID] : null;

  // SWR itself returns these values
  const { data, error, isLoading } = useSWR(
    key,

    //SWR automatically passes the key to the fetcher function
    async ([, connId]) => {
      const response = await fetchSavedQueries({ conn_id: connId });

      return response.queries ?? [];
    },
    {
      revalidateIfStale: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false
    }
  );

  return {
    queries: mergeQueries(getSessionSavedQueries(), data ?? []),
    error,
    isLoading
  };
}
