import { LockKeyhole, Settings, Star } from 'lucide-react';
import type { JSX, ReactNode } from 'react';
import { normalizeService } from '../../../shared/normalize';
import type { ServiceGroup, SidebarView } from '../lib/credential-filtering';
import SearchField from './SearchField';

interface SidebarProps {
  readonly query: string;
  readonly onQueryChange: (value: string) => void;
  readonly view: SidebarView;
  readonly onViewChange: (view: SidebarView) => void;
  readonly services: readonly ServiceGroup[];
  readonly activeService: string | null;
  readonly onSelectService: (service: string | null) => void;
  readonly footer?: ReactNode;
}

export default function Sidebar({
  query,
  onQueryChange,
  view,
  onViewChange,
  services,
  activeService,
  onSelectService,
  footer,
}: SidebarProps): JSX.Element {
  const activeKey = activeService === null ? null : normalizeService(activeService);
  // A search cuts across both views, so neither entry is highlighted while one
  // is running — the results header names the query instead.
  const searching = query.trim().length > 0;

  return (
    <nav className="sidebar" aria-label="Vault navigation">
      <div className="brand">Vault</div>

      <SearchField
        id="vault-search"
        label="Search passwords"
        value={query}
        placeholder="Search passwords"
        onChange={onQueryChange}
      />

      <div className="nav">
        <button
          type="button"
          className={!searching && view === 'all' ? 'nav-item nav-item--active' : 'nav-item'}
          aria-current={!searching && view === 'all' ? 'page' : undefined}
          onClick={() => onViewChange('all')}
        >
          <LockKeyhole aria-hidden="true" />
          <span className="nav-label">All Passwords</span>
        </button>
        <button
          type="button"
          className={!searching && view === 'favorites' ? 'nav-item nav-item--active' : 'nav-item'}
          aria-current={!searching && view === 'favorites' ? 'page' : undefined}
          onClick={() => onViewChange('favorites')}
        >
          <Star aria-hidden="true" />
          <span className="nav-label">Favorites</span>
        </button>
      </div>

      <div className="services-block">
        <h2 className="section-label">Services</h2>
        <div className="services">
          {services.map((group) => {
            const active = normalizeService(group.service) === activeKey;
            return (
              <button
                key={group.service}
                type="button"
                className={active ? 'service-item service-item--active' : 'service-item'}
                aria-current={active ? 'true' : undefined}
                onClick={() => onSelectService(active ? null : group.service)}
              >
                <span className="service-name">{group.service}</span>
                <span className="service-count">{group.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="sidebar-footer">
        {footer}
        {/* The frame shows a Settings destination; the preferences screen is a
            later unit, so the entry is present and inert rather than fake. */}
        <button
          type="button"
          className="nav-item nav-item--settings"
          disabled
          aria-label="Settings (not available in this build)"
          title="Not available in this build"
        >
          <Settings aria-hidden="true" />
          <span className="nav-label">Settings</span>
        </button>
      </div>
    </nav>
  );
}
