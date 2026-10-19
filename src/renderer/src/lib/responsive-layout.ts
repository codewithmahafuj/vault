import { toggleSelection } from './credential-filtering';

export type DetailPane = 'list' | 'details';

// The widest window that shows one work pane at a time. `tests/responsive-layout.test.ts`
// reads the stylesheet and fails if this and the compact media query drift apart.
export const COMPACT_MAX_WIDTH = 899;

// A compact window asks for the details pane when the user opens a row, but the
// pane is only worth showing while that row is still there: a delete, a
// deselection, or a filter that hides the record must fall back to the list
// instead of painting an empty panel with no way out.
export function detailPane(requested: DetailPane, hasSelection: boolean): DetailPane {
  return requested === 'details' && hasSelection ? 'details' : 'list';
}

export interface RowPress {
  readonly selectedId: string | null;
  readonly pane: DetailPane;
}

// Pressing a row selects it and travels to its details; pressing the selected row
// again clears the selection, which is how a wide window hides the card. The one
// exception is the row a compact window just left: after Back the selection is
// kept and the pane is the list, so a press there means "open it again" and must
// not deselect, or the tap looks like nothing happened. The `compact` gate keeps
// the wide window's deselect rule exactly as it was.
export function rowPress(
  current: string | null,
  pressed: string,
  pane: DetailPane,
  compact: boolean,
): RowPress {
  if (compact && current === pressed && pane === 'list') {
    return { selectedId: current, pane: 'details' };
  }
  const selectedId = toggleSelection(current, pressed);
  return { selectedId, pane: selectedId === null ? 'list' : 'details' };
}
