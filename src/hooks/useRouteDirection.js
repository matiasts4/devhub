import { useLocation, useNavigationType } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';

/**
 * Tracks browser history push/pop to determine route transition direction.
 *
 * Returns 'forward' for PUSH navigations and 'back' for POP navigations.
 * REPLACE navigations keep the previous direction. The hook maintains an
 * internal pathname stack so multiple consecutive POPs are reported correctly.
 */
export function useRouteDirection() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  const stackRef = useRef([pathname]);
  const [direction, setDirection] = useState('forward');

  useEffect(() => {
    const stack = stackRef.current;
    if (navigationType === 'PUSH') {
      stack.push(pathname);
      setDirection('forward');
    } else if (navigationType === 'POP') {
      const idx = stack.lastIndexOf(pathname);
      if (idx !== -1 && idx < stack.length - 1) {
        stack.length = idx + 1;
      }
      setDirection('back');
    } else {
      // REPLACE: overwrite the current top without changing direction.
      stack[stack.length - 1] = pathname;
    }
  }, [pathname, navigationType]);

  return direction;
}
