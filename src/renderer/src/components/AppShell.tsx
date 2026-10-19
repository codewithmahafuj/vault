import type { JSX, ReactNode } from 'react';
import type { DetailPane } from '../lib/responsive-layout';

interface AppShellProps {
  readonly sidebar: ReactNode;
  readonly list: ReactNode;
  readonly details: ReactNode;
  // Which of the two work panes a compact window shows. Wide windows draw both
  // and ignore it.
  readonly pane: DetailPane;
}

export default function AppShell({ sidebar, list, details, pane }: AppShellProps): JSX.Element {
  return (
    <div className="app-shell" data-pane={pane}>
      {sidebar}
      <main className="workspace-list">{list}</main>
      <section className="workspace-details">{details}</section>
    </div>
  );
}
