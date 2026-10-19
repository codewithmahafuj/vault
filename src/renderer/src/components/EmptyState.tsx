import type { JSX, ReactNode } from 'react';

interface EmptyStateProps {
  readonly icon: ReactNode;
  readonly title: string;
  readonly description: string;
  readonly action?: JSX.Element;
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps): JSX.Element {
  return (
    <div className="empty-state">
      <span className="empty-badge" aria-hidden="true">
        {icon}
      </span>
      <h2 className="empty-title">{title}</h2>
      <p className="empty-body">{description}</p>
      {action}
    </div>
  );
}
