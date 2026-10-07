import { useCallback, useEffect, useState } from 'react';

/** Runs an async loader whenever deps change: { data, isLoading, error, reload } */
export function useAsync(loader, deps) {
  const [state, setState] = useState({ data: null, isLoading: true, error: null });
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    let isCancelled = false;
    setState((previous) => ({ ...previous, isLoading: true, error: null }));
    loader()
      .then((data) => !isCancelled && setState({ data, isLoading: false, error: null }))
      .catch((error) => !isCancelled && setState({ data: null, isLoading: false, error }));
    return () => {
      isCancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadKey]);

  return { ...state, reload };
}
