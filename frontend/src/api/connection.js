import { useMemo } from 'react';
import useSWR, { mutate } from 'swr';

/**
 * Unique SWR cache key.
 * All components using this key will share the same connection instance.
 */
const key = 'api/connection/id';
const connectionDetailsKey = 'connection_details';

/**
 * Load the initial value from sessionStorage.
 * This runs once when SWR initializes (via fallbackData).
 */
const getSavedConnectionID = () => {
  try {
    // Try to read previously stored value
    const saved = sessionStorage.getItem('connection_id');

    // If it exists, return it. Otherwise return null.
    return saved ?? null;
  } catch {
    // If sessionStorage is unavailable (edge cases), return null safely
    return null;
  }
};

/**
 * React hook to access the current connectionID.
 *
 * - Subscribes to the SWR store.
 * - Uses sessionStorage as persistent fallback.
 * - Disables automatic revalidation because this is local state.
 */
export function useConnectionID() {
  const { data } = useSWR(
    key,
    () => null, // No fetcher needed — session storage state only
    {
      fallbackData: getSavedConnectionID(), // Initialize from sessionStorage
      revalidateIfStale: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false
    }
  );

  /**
   * useMemo prevents unnecessary re-renders
   * when parent components re-render.
   */
  return useMemo(() => data, [data]);
}

/**
 * Updates the connectionID globally.
 *
 * What this does:
 * 1. Saves the value into sessionStorage (browser tab persistence)
 * 2. Updates SWR cache
 * 3. Triggers re-render in all subscribed components
 */
export function setConnectionID(connectionID) {
  try {
    if (connectionID === null) {
      // If null, remove it from storage (clean logout case)
      sessionStorage.removeItem('connection_id');
    } else {
      // Otherwise store it
      sessionStorage.setItem('connection_id', connectionID);
    }
  } catch {
    // Fail silently if storage is unavailable
  }

  /**
   * mutate(key, newValue, false)
   *
   * - Updates SWR cache immediately
   * - false = do NOT revalidate (no fetcher anyway)
   */
  mutate(key, connectionID, false);
}

/**
 * Store the credentials needed to recreate the current connection after a
 * connection-id expiry. sessionStorage keeps them scoped to this browser tab.
 */
export function setConnectionDetails(connection) {
  try {
    sessionStorage.setItem(connectionDetailsKey, JSON.stringify(connection));
  } catch {
    // Recovery falls back to the existing loading flow if storage is unavailable.
  }
}

export function getConnectionDetails() {
  try {
    const saved = sessionStorage.getItem(connectionDetailsKey);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}
