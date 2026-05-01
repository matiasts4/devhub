import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getResumableSessionAdapters,
  mergeResumableCatalogResults,
} from '@/lib/agentSessions/resumableSessionAdapters';

function toErrorResult(error) {
  return {
    status: 'error',
    sessions: [],
    error: {
      code: 'catalog-failed',
      message: error?.message || 'Resumable sessions could not be loaded.',
      retryable: true,
    },
  };
}

export default function useResumableSessionCatalog({ cwd = null, adapters } = {}) {
  const resolvedAdapters = useMemo(() => adapters || getResumableSessionAdapters(), [adapters]);
  const abortRef = useRef(null);
  const requestIdRef = useRef(0);
  const [state, setState] = useState({
    status: 'loading',
    sessions: [],
    error: null,
    isLoading: true,
  });

  const refresh = useCallback(async () => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState((current) => ({
      ...current,
      status: 'loading',
      error: null,
      isLoading: true,
    }));

    if (!resolvedAdapters.length) {
      setState({ status: 'empty', sessions: [], error: null, isLoading: false });
      return;
    }

    const results = await Promise.all(
      resolvedAdapters.map(async (adapter) => {
        try {
          return await adapter.listSessions({ cwd, signal: controller.signal });
        } catch (error) {
          if (controller.signal.aborted) {
            return null;
          }
          return { provider: adapter.id, ...toErrorResult(error) };
        }
      })
    );

    if (controller.signal.aborted || requestId !== requestIdRef.current) {
      return;
    }

    const merged = mergeResumableCatalogResults(results.filter(Boolean));
    setState({
      status: merged.status,
      sessions: merged.sessions,
      error: merged.error,
      isLoading: false,
    });
  }, [cwd, resolvedAdapters]);

  useEffect(() => {
    refresh();
    return () => {
      abortRef.current?.abort();
    };
  }, [refresh]);

  return {
    ...state,
    refresh,
    retry: refresh,
  };
}
