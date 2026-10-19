import { Component } from 'react';
import type { ReactNode } from 'react';
import { BOUNDARY_ACTION_LABEL, BOUNDARY_COPY, safeFailureLogLine } from '../lib/error-boundary';

interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly failed: boolean;
}

// The renderer's last line of defence: a component that throws while drawing
// replaces the window with one honest sentence instead of leaving a blank frame
// and a console the user cannot see. It is deliberately the smallest thing that
// works --- a flag, a fixed message, and one reload --- because it has to render
// correctly on the assumption that everything beside it just failed.
//
// What it does not claim: an exception thrown by an event handler or by a
// `void`-ed promise never reaches React's render path, so it is not caught here.
// Those are the paths `callVault()` already folds into a shown failure.
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  // The message stays out of the production log on purpose; see
  // `safeFailureLogLine`. A boundary that swallowed a crash silently would be
  // worse than one that prints its kind.
  override componentDidCatch(error: Error): void {
    console.error(safeFailureLogLine(error, import.meta.env.DEV));
  }

  override render(): ReactNode {
    if (!this.state.failed) {
      return this.props.children;
    }

    return (
      <div className="boundary-state">
        <h2 className="empty-title">{BOUNDARY_COPY.title}</h2>
        <p className="empty-body">{BOUNDARY_COPY.description}</p>
        <button
          type="button"
          className="button button--secondary"
          onClick={() => window.location.reload()}
        >
          {BOUNDARY_ACTION_LABEL}
        </button>
      </div>
    );
  }
}
