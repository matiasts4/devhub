'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { dirname, isUnder, joinPath, sameDirListing, treeNodesToEntries } from './pathUtils';
import { cacheGet, cacheInvalidate, cacheInvalidateMany, cacheSet } from './dirCache';
import { invalidateGitStatus } from './useGitStatus';
import {
  clearAllWatches,
  listenFsChanged,
  setWatchBase,
  watchAdd,
  watchRemove,
} from './watchClient';

const EXPANSION_CACHE_LIMIT = 8;
const expansionCache = new Map();

function rememberExpansion(root, expanded) {
  expansionCache.delete(root);
  if (expanded.size > 0) expansionCache.set(root, [...expanded]);
  while (expansionCache.size > EXPANSION_CACHE_LIMIT) {
    const oldest = expansionCache.keys().next().value;
    if (oldest === undefined) break;
    expansionCache.delete(oldest);
  }
}

function recallExpansion(root) {
  const v = expansionCache.get(root);
  if (!v) return [];
  expansionCache.delete(root);
  expansionCache.set(root, v);
  return v;
}

function applyListing(path, entries, nodesRef, expandedRef, watchedRef, setNodes, setExpanded) {
  const prev = nodesRef.current[path];
  if (prev?.status === 'loaded' && sameDirListing(prev.entries, entries)) {
    return false;
  }

  const liveDirs = new Set(
    entries.filter((e) => e.kind === 'dir').map((e) => e.path || joinPath(path, e.name))
  );
  const removedRoots = [];
  for (const key of Object.keys(nodesRef.current)) {
    if (dirname(key) === path && !liveDirs.has(key)) removedRoots.push(key);
  }
  const dead = new Set();
  if (removedRoots.length > 0) {
    const candidates = new Set([
      ...Object.keys(nodesRef.current),
      ...expandedRef.current,
      ...watchedRef.current,
    ]);
    for (const k of candidates) {
      if (removedRoots.some((r) => isUnder(k, r))) dead.add(k);
    }
  }

  setNodes((s) => {
    const next = {};
    for (const [k, v] of Object.entries(s)) {
      if (!dead.has(k)) next[k] = v;
    }
    next[path] = { status: 'loaded', entries };
    return next;
  });

  if (dead.size > 0) {
    setExpanded((c) => {
      let changed = false;
      const n = new Set(c);
      for (const d of dead) if (n.delete(d)) changed = true;
      return changed ? n : c;
    });
    const toUnwatch = [];
    for (const d of dead) if (watchedRef.current.delete(d)) toUnwatch.push(d);
    if (toUnwatch.length) watchRemove(toUnwatch);
  }
  return true;
}

/**
 * @param {string|null} basePath
 * @param {{ initialExpanded?: string[], onExpandedChange?: Function, onPathRenamed?: Function, onPathDeleted?: Function, enableWatch?: boolean, deferSecondaryMs?: number }} options
 */
export function useFileTree(basePath, options = {}) {
  const rootKey = '';
  const cacheKey = basePath || '';
  const enableWatch = options.enableWatch !== false;
  const deferSecondaryMs = options.deferSecondaryMs ?? 0;
  const skipPersistOnceRef = useRef(true);

  const [nodes, setNodes] = useState({});
  const [expanded, setExpanded] = useState(() => new Set(options.initialExpanded || []));
  const [pendingCreate, setPendingCreate] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [rootError, setRootError] = useState('');
  const [watchReady, setWatchReady] = useState(false);

  const expandedRef = useRef(expanded);
  const nodesRef = useRef(nodes);
  const watchedRef = useRef(new Set());
  const onExpandedChangeRef = useRef(options.onExpandedChange);
  const userToggledRef = useRef(false);

  useEffect(() => {
    expandedRef.current = expanded;
  }, [expanded]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    onExpandedChangeRef.current = options.onExpandedChange;
  }, [options.onExpandedChange]);

  useEffect(() => {
    if (skipPersistOnceRef.current) {
      skipPersistOnceRef.current = false;
      return;
    }
    if (!userToggledRef.current) return;
    onExpandedChangeRef.current?.([...expanded]);
  }, [expanded]);

  const addWatch = useCallback(
    (path) => {
      if (!enableWatch || !watchReady) return;
      if (watchedRef.current.has(path)) return;
      watchedRef.current.add(path);
      watchAdd([path]);
    },
    [enableWatch, watchReady]
  );

  const removeWatch = useCallback(
    (path) => {
      if (!enableWatch) return;
      if (!watchedRef.current.delete(path)) return;
      watchRemove([path]);
    },
    [enableWatch]
  );

  const fetchChildren = useCallback(
    async (path, { fresh = false } = {}) => {
      if (!basePath) return;
      if (!fresh) {
        const cached = cacheGet(basePath, path);
        if (cached) {
          applyListing(path, cached, nodesRef, expandedRef, watchedRef, setNodes, setExpanded);
          return;
        }
      } else {
        cacheInvalidate(basePath, path);
      }

      if (nodesRef.current[path]?.status !== 'loaded') {
        setNodes((s) => ({ ...s, [path]: { status: 'loading' } }));
      }
      try {
        const params = new URLSearchParams();
        params.set('base', basePath);
        if (path) params.set('dir', path);
        if (fresh) params.set('fresh', '1');
        const response = await fetch(`/api/fs/tree?${params}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || 'Failed to list directory');
        const entries = treeNodesToEntries(Array.isArray(data.tree) ? data.tree : []);
        cacheSet(basePath, path, entries);
        applyListing(path, entries, nodesRef, expandedRef, watchedRef, setNodes, setExpanded);
        setRootError('');
      } catch (e) {
        const message = e?.message || String(e);
        setNodes((s) => ({ ...s, [path]: { status: 'error', message } }));
        if (!path) setRootError(message);
      }
    },
    [basePath]
  );

  const fetchBatch = useCallback(
    async (dirs, { fresh = false } = {}) => {
      if (!basePath || !dirs.length) return;
      const needFetch = [];
      for (const dir of dirs) {
        if (!fresh) {
          const cached = cacheGet(basePath, dir);
          if (cached) {
            applyListing(dir, cached, nodesRef, expandedRef, watchedRef, setNodes, setExpanded);
            continue;
          }
        }
        needFetch.push(dir);
        if (nodesRef.current[dir]?.status !== 'loaded') {
          setNodes((s) => ({ ...s, [dir]: { status: 'loading' } }));
        }
      }
      if (needFetch.length === 0) return;

      try {
        const response = await fetch('/api/fs/tree/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base: basePath, dirs: needFetch, fresh }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || 'Batch list failed');
        const listings = data.listings || {};
        for (const dir of needFetch) {
          const entries = treeNodesToEntries(Array.isArray(listings[dir]) ? listings[dir] : []);
          cacheSet(basePath, dir, entries);
          applyListing(dir, entries, nodesRef, expandedRef, watchedRef, setNodes, setExpanded);
        }
        setRootError('');
      } catch (e) {
        // Fallback: individual fetches
        console.warn('[useFileTree] batch failed, falling back', e);
        await Promise.all(needFetch.map((d) => fetchChildren(d, { fresh })));
      }
    },
    [basePath, fetchChildren]
  );

  useEffect(() => {
    if (!basePath) {
      setNodes({});
      setExpanded(new Set());
      setPendingCreate(null);
      setRenaming(null);
      setRootError('');
      setWatchReady(false);
      clearAllWatches();
      return undefined;
    }

    setWatchBase(basePath);
    setPendingCreate(null);
    setRenaming(null);
    skipPersistOnceRef.current = true;
    userToggledRef.current = false;
    setWatchReady(false);

    const restored =
      options.initialExpanded?.length > 0 ? options.initialExpanded : recallExpansion(cacheKey);
    setExpanded(new Set(restored));
    setNodes({});
    nodesRef.current = {};

    const dirs = [rootKey, ...restored];
    void fetchBatch(dirs);

    let cancelled = false;
    const armWatch = () => {
      if (cancelled || !enableWatch) return;
      setWatchReady(true);
      for (const p of dirs) watchedRef.current.add(p);
      watchAdd(dirs);
    };
    const bootId =
      deferSecondaryMs > 0
        ? window.setTimeout(armWatch, deferSecondaryMs)
        : typeof requestIdleCallback === 'function'
          ? requestIdleCallback(armWatch, { timeout: 500 })
          : window.setTimeout(armWatch, 0);

    return () => {
      cancelled = true;
      rememberExpansion(cacheKey, expandedRef.current);
      window.clearTimeout(bootId);
      if (typeof cancelIdleCallback === 'function') {
        try {
          cancelIdleCallback(bootId);
        } catch {
          /* ignore */
        }
      }
      if (watchedRef.current.size > 0) {
        watchRemove([...watchedRef.current]);
        watchedRef.current.clear();
      }
      setWatchReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePath, cacheKey, enableWatch, deferSecondaryMs, fetchBatch]);

  useEffect(() => {
    if (!enableWatch || !watchReady) return undefined;
    let timer = 0;
    const pending = new Set();
    return listenFsChanged((paths) => {
      for (const p of paths) {
        const parent = dirname(p);
        if (nodesRef.current[parent]?.status === 'loaded') pending.add(parent);
        if (nodesRef.current[p]?.status === 'loaded') pending.add(p);
        if (!p && nodesRef.current['']?.status === 'loaded') pending.add('');
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const dirs = [...pending];
        pending.clear();
        if (dirs.length === 0) return;
        cacheInvalidateMany(basePath, dirs);
        void fetchBatch(dirs, { fresh: true });
        invalidateGitStatus();
      }, 150);
    });
  }, [enableWatch, watchReady, fetchBatch, basePath]);

  const toggle = useCallback(
    (path) => {
      userToggledRef.current = true;
      if (expandedRef.current.has(path)) {
        setExpanded((curr) => {
          const next = new Set(curr);
          next.delete(path);
          return next;
        });
        removeWatch(path);
      } else {
        setExpanded((curr) => {
          const next = new Set(curr);
          next.add(path);
          return next;
        });
        addWatch(path);
        void fetchChildren(path);
      }
    },
    [fetchChildren, addWatch, removeWatch]
  );

  const expand = useCallback(
    (path) => {
      if (expandedRef.current.has(path)) return;
      userToggledRef.current = true;
      setExpanded((curr) => {
        const next = new Set(curr);
        next.add(path);
        return next;
      });
      addWatch(path);
      void fetchChildren(path);
    },
    [fetchChildren, addWatch]
  );

  const refresh = useCallback(
    (path) => {
      cacheInvalidate(basePath, path ?? '');
      void fetchChildren(path ?? '', { fresh: true });
    },
    [fetchChildren, basePath]
  );

  const refreshAllLoaded = useCallback(() => {
    const dirs = Object.entries(nodesRef.current)
      .filter(([, state]) => state.status === 'loaded')
      .map(([path]) => path);
    cacheInvalidateMany(basePath, dirs);
    void fetchBatch(dirs, { fresh: true });
    invalidateGitStatus();
  }, [fetchBatch, basePath]);

  const beginCreate = useCallback(
    (parentPath, kind) => {
      setRenaming(null);
      setPendingCreate({ parentPath: parentPath ?? '', kind });
      if (parentPath) {
        userToggledRef.current = true;
        setExpanded((curr) => {
          if (curr.has(parentPath)) return curr;
          const next = new Set(curr);
          next.add(parentPath);
          return next;
        });
        addWatch(parentPath);
        if (!nodesRef.current[parentPath]) void fetchChildren(parentPath);
      }
    },
    [fetchChildren, addWatch]
  );

  const cancelCreate = useCallback(() => setPendingCreate(null), []);

  const commitCreate = useCallback(
    async (name) => {
      if (!pendingCreate || !basePath) return;
      const trimmed = name.trim();
      if (!trimmed) {
        setPendingCreate(null);
        return;
      }
      const path = joinPath(pendingCreate.parentPath, trimmed);
      try {
        const response = await fetch('/api/fs/mutate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base: basePath,
            action: pendingCreate.kind === 'dir' ? 'create_dir' : 'create_file',
            path,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Create failed');
        cacheInvalidate(basePath, pendingCreate.parentPath);
        await fetchChildren(pendingCreate.parentPath, { fresh: true });
        invalidateGitStatus();
      } catch (e) {
        console.error('create failed:', e);
      } finally {
        setPendingCreate(null);
      }
    },
    [pendingCreate, basePath, fetchChildren]
  );

  const beginRename = useCallback((path) => {
    setPendingCreate(null);
    setRenaming(path);
  }, []);

  const cancelRename = useCallback(() => setRenaming(null), []);

  const commitRename = useCallback(
    async (newName) => {
      if (!renaming || !basePath) return;
      const trimmed = newName.trim();
      const parent = dirname(renaming);
      const oldName = renaming.slice(parent ? parent.length + 1 : 0);
      if (!trimmed || trimmed === oldName) {
        setRenaming(null);
        return;
      }
      const to = joinPath(parent, trimmed);
      try {
        const response = await fetch('/api/fs/mutate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base: basePath,
            action: 'rename',
            from: renaming,
            to,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Rename failed');
        options.onPathRenamed?.(renaming, to);
        cacheInvalidate(basePath, parent);
        await fetchChildren(parent, { fresh: true });
        invalidateGitStatus();
      } catch (e) {
        console.error('rename failed:', e);
      } finally {
        setRenaming(null);
      }
    },
    [renaming, basePath, fetchChildren, options]
  );

  const deletePath = useCallback(
    async (path) => {
      if (!basePath || !path) return;
      try {
        const response = await fetch('/api/fs/mutate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base: basePath, action: 'delete', path }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Delete failed');
        options.onPathDeleted?.(path);
        const parent = dirname(path);
        cacheInvalidate(basePath, parent);
        await fetchChildren(parent, { fresh: true });
        invalidateGitStatus();
      } catch (e) {
        console.error('delete failed:', e);
      }
    },
    [basePath, fetchChildren, options]
  );

  const movePath = useCallback(
    async (from, toDir) => {
      if (!basePath || !from) return;
      const name = from.slice(from.lastIndexOf('/') + 1);
      const to = joinPath(toDir, name);
      if (to === from) return;
      const target = nodesRef.current[toDir];
      if (target?.status === 'loaded' && target.entries.some((e) => e.name === name)) {
        console.warn(`move skipped: "${name}" already exists in ${toDir}`);
        return;
      }
      try {
        const response = await fetch('/api/fs/mutate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base: basePath, action: 'rename', from, to }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Move failed');
        options.onPathRenamed?.(from, to);
        const fromParent = dirname(from);
        cacheInvalidateMany(basePath, [fromParent, toDir]);
        await Promise.all([
          fetchChildren(fromParent, { fresh: true }),
          fetchChildren(toDir, { fresh: true }),
        ]);
        invalidateGitStatus();
      } catch (e) {
        console.error('move failed:', e);
      }
    },
    [basePath, fetchChildren, options]
  );

  const isLoading = !nodes[rootKey] || nodes[rootKey]?.status === 'loading';

  return {
    nodes,
    expanded,
    pendingCreate,
    renaming,
    rootError,
    isLoading,
    toggle,
    expand,
    refresh,
    refreshAllLoaded,
    beginCreate,
    cancelCreate,
    commitCreate,
    beginRename,
    cancelRename,
    commitRename,
    deletePath,
    movePath,
    joinPath,
  };
}
