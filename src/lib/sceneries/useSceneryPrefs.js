'use client';

/**
 * useSceneryPrefs — React hook returning live scenery preferences.
 *
 * Subscribes to the `devhub:scenery-changed` event so any component
 * re-renders instantly when the wallpaper configuration changes.
 */

import { useState, useEffect } from 'react';
import { readSceneryPrefs, SCENERY_CHANGED_EVENT } from './sceneryPreferences';

export function useSceneryPrefs() {
  const [prefs, setPrefs] = useState(() => readSceneryPrefs());

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    setPrefs(readSceneryPrefs());
    const handleChange = (event) => {
      setPrefs(event.detail || readSceneryPrefs());
    };
    window.addEventListener(SCENERY_CHANGED_EVENT, handleChange);
    return () => window.removeEventListener(SCENERY_CHANGED_EVENT, handleChange);
  }, []);

  return prefs;
}
