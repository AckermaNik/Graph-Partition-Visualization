import { AppStateContext } from './AppStateContext';
import { useContext } from 'react';

export function useAppState() {
  return useContext(AppStateContext); // "Hey React, give me the value from AppStateContext"
}
