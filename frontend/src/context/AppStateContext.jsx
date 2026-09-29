import { createContext, useEffect, useMemo, useState, useCallback, useRef } from 'react';

/* This creates the "tunnel." It’s an object that has two properties:
 a Provider (which holds the data) and a Consumer (which receives it).
 */
export const AppStateContext = createContext(null);

const MAX_PANELS = 6; // dont exagerate because if many WebGL canvases for graphs are active then some graphs may fall apart

/*  Helper function to build tha value and give it to the provider- THE BRAIN OF GLOBAL STATE */
export function AppStateProvider({ children }) {
  const [activePanelId, setActivePanelId] = useState(0);

  const [panels, setPanels] = useState([]);

  // stable function reference -React will give you the same function object between renders, unless its dependencies change.

  const addPanel = useCallback(
    (query) => {
      const usedId = crypto.randomUUID();

      setPanels((prev) => {
        return [
          {
            id: usedId,
            query,
            status: 'loading',
            result: null,
            partitionStats: null,
            error: null
          },
          ...prev
        ].slice(0, MAX_PANELS);
      });

      return usedId;
    },
    [setPanels]
  );

  const addTwoPanels = useCallback(
    (query, graphResult, tableResult) => {
      // generate IDs synchronously
      const graphId = crypto.randomUUID();
      const tableId = crypto.randomUUID();

      const newGraphPanel = {
        id: graphId,
        query,
        status: 'success',
        result: graphResult,
        partitionStats: null,
        error: null
      };

      const newTablePanel = {
        id: tableId,
        query,
        status: 'success',
        result: { kind: 'table', table: tableResult },
        partitionStats: null,
        error: null
      };

      setPanels((prev) => {
        return [newGraphPanel, newTablePanel, ...prev].slice(0, MAX_PANELS);
      });

      return [graphId, tableId];
    },
    [setPanels]
  );
  // stable function reference
  const removePanel = useCallback((id) => {
    setPanels((prev) => {
      const next = prev.filter((p) => p.id !== id);
      const safeNext = next.length > 0 ? next : [];

      setActivePanelId((currentActiveId) => {
        if (currentActiveId !== id) return currentActiveId;
        return safeNext[0]?.id ?? -1;
      });

      return safeNext;
    });
  }, []);

  const removeAllPanels = useCallback(() => {
    setPanels([]); // Clear the array
    setActivePanelId(0); // Reset active pointer
  }, []);

  //only for panel created by addPanel()
  const updatePanel = useCallback((id, patch) => {
    setPanels((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p))); //shallow merging by copying all existing fields and adding the inside fields of patch to the panel
  }, []);

  //If this object’s reference changes, all consumers re-render
  const value = useMemo(
    () => ({
      panels,
      addPanel,
      removePanel,
      updatePanel,
      addTwoPanels,
      removeAllPanels,

      activePanelId,
      setActivePanelId
    }),
    [panels, addPanel, removePanel, updatePanel, addTwoPanels, removeAllPanels, activePanelId]
  );

  //the broadcasted value for consumer to see
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}
