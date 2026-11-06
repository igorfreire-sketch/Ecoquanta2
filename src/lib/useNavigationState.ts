import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';

export const BEFORE_APP_NAVIGATION = 'ecoquanta:before-navigation';

// App has state-based navigation (including keyboard and programmatic actions).
// Editors can veto a transition before React unmounts them.
export function useNavigationState<T>(initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(initial);
  const current = useRef(value);
  current.current = value;
  const navigate = useCallback<Dispatch<SetStateAction<T>>>((action) => {
    const next = typeof action === 'function' ? (action as (previous: T) => T)(current.current) : action;
    if (Object.is(next, current.current)) return;
    if (!window.dispatchEvent(new Event(BEFORE_APP_NAVIGATION, { cancelable: true }))) return;
    current.current = next;
    setValue(() => next);
  }, []);
  return [value, navigate];
}
