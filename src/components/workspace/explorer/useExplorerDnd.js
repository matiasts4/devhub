'use client';

import { useCallback, useRef, useState } from 'react';
import { dirname, isUnder } from './pathUtils';

export function useExplorerDnd({ rootPath = '', isDir, onMove }) {
  const [dropTargetDir, setDropTargetDir] = useState(null);
  const dragPathRef = useRef(null);

  const onDragStart = useCallback((e, path) => {
    dragPathRef.current = path;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', path);
  }, []);

  const resolveTargetDir = useCallback((path, pathIsDir) => {
    if (pathIsDir) return path;
    return dirname(path);
  }, []);

  const onDragOver = useCallback(
    (e, path, pathIsDir) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const from = dragPathRef.current;
      if (!from) return;
      const target = resolveTargetDir(path, pathIsDir);
      if (from === target || isUnder(target, from)) {
        setDropTargetDir(null);
        return;
      }
      setDropTargetDir(target);
    },
    [resolveTargetDir]
  );

  const onDragLeave = useCallback(() => {
    // no-op: cleared on drag end / drop
  }, []);

  const onDrop = useCallback(
    (e, path, pathIsDir) => {
      e.preventDefault();
      const from = dragPathRef.current || e.dataTransfer.getData('text/plain');
      const target = resolveTargetDir(path, pathIsDir);
      setDropTargetDir(null);
      dragPathRef.current = null;
      if (!from || from === target || isUnder(target, from)) return;
      void onMove?.(from, target ?? rootPath);
    },
    [onMove, resolveTargetDir, rootPath]
  );

  const onDragEnd = useCallback(() => {
    dragPathRef.current = null;
    setDropTargetDir(null);
  }, []);

  const onRootDragOver = useCallback(
    (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDropTargetDir(rootPath);
    },
    [rootPath]
  );

  const onRootDrop = useCallback(
    (e) => {
      e.preventDefault();
      const from = dragPathRef.current || e.dataTransfer.getData('text/plain');
      setDropTargetDir(null);
      dragPathRef.current = null;
      if (!from) return;
      void onMove?.(from, rootPath);
    },
    [onMove, rootPath]
  );

  return {
    dropTargetDir,
    handlers: {
      onDragStart,
      onDragOver,
      onDragLeave,
      onDrop,
      onDragEnd,
    },
    onRootDragOver,
    onRootDrop,
    isDir,
  };
}
