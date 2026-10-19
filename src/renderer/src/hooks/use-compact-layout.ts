import { useEffect, useState } from 'react';
import { COMPACT_MAX_WIDTH } from '../lib/responsive-layout';

const query = `(max-width: ${COMPACT_MAX_WIDTH}px)`;

// The stylesheet decides what a compact window looks like; this is the same
// question asked from the other side, for the one rule that cannot be answered
// in CSS — whether a press on the row the user just came back from reopens it.
export function useCompactLayout(): boolean {
  const [compact, setCompact] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent): void => {
      setCompact(event.matches);
    };
    media.addEventListener('change', onChange);
    // A resize can land between the render above and this effect.
    setCompact(media.matches);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return compact;
}
