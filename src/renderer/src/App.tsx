import {
  ChevronLeft,
  FilePlus2,
  Loader,
  MousePointerClick,
  Plus,
  Search,
  Star,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import type {
  CredentialCopyField,
  CredentialInput,
  CredentialSummary,
} from '../../shared/credential';
import type { CredentialFormValues } from '../../shared/credential-form';
import { normalizeService } from '../../shared/normalize';
import type { VaultErrorCode } from '../../shared/vault-result';
import AppShell from './components/AppShell';
import CredentialDetails from './components/CredentialDetails';
import CredentialFormModal from './components/CredentialFormModal';
import CredentialList from './components/CredentialList';
import DeleteConfirmModal from './components/DeleteConfirmModal';
import EmptyState from './components/EmptyState';
import Sidebar from './components/Sidebar';
import { useCompactLayout } from './hooks/use-compact-layout';
import { useCredentials } from './hooks/use-credentials';
import type { SidebarView } from './lib/credential-filtering';
import {
  filterCredentials,
  groupServices,
  matchesQuery,
  selectedRecord,
} from './lib/credential-filtering';
import { emptyFormValues, existingCollision, formValuesFor } from './lib/credential-form';
import type { CopyOutcome } from './lib/details-panel';
import { listFailureCopy, writeUnavailableCopy } from './lib/data-source';
import type { DetailPane } from './lib/responsive-layout';
import { detailPane, rowPress } from './lib/responsive-layout';
import {
  answerSecret,
  hideSecret,
  ownsCard,
  releaseSecret,
  requestSecret,
} from './lib/secret-lifecycle';
import { callVault } from './lib/vault-bridge';

// Everything the open Add/Edit card needs. It lives in one object so a single
// state update moves the card between its loading, editing, saving and failed
// states without a half-applied transition.
interface CardState {
  readonly mode: 'add' | 'edit';
  readonly credentialId: string | null;
  readonly initialValues: CredentialFormValues;
  readonly favorite: boolean;
  readonly secretLoading: boolean;
  readonly secretFailure: VaultErrorCode | null;
  readonly submitFailure: VaultErrorCode | null;
  readonly duplicate: CredentialSummary | null;
  readonly busy: boolean;
}

// The details card's own transient state, keyed by the record it belongs to. It
// lives here rather than in the card because this is the layer that reaches the
// vault: the password only ever exists in `secret`, the `id` on it says which
// record it was read for, and every affordance that cannot answer for that
// record ignores it.
interface DetailsState {
  readonly secret: { readonly id: string; readonly password: string } | null;
  readonly secretPendingId: string | null;
  readonly secretFailure: VaultErrorCode | null;
  readonly favoritePendingId: string | null;
  readonly favoriteFailure: VaultErrorCode | null;
}

const idleDetails: DetailsState = {
  secret: null,
  secretPendingId: null,
  secretFailure: null,
  favoritePendingId: null,
  favoriteFailure: null,
};

export default function App(): JSX.Element {
  const { credentials, status, source, failure, reload } = useCredentials();
  const compact = useCompactLayout();
  const [query, setQuery] = useState('');
  const [view, setView] = useState<SidebarView>('all');
  const [service, setService] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Which work pane a compact window shows. Wide windows render both panes at
  // once and the stylesheet ignores this, so it only ever steers narrow ones.
  const [pane, setPane] = useState<DetailPane>('list');
  const [card, setCard] = useState<CardState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CredentialSummary | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteFailure, setDeleteFailure] = useState<VaultErrorCode | null>(null);
  const [details, setDetails] = useState<DetailsState>(idleDetails);

  // Writing through a bridge that is not there would claim a save that cannot
  // happen, so every write affordance stays withheld until the vault answers.
  const canWrite = window.vault !== undefined;

  const visible = useMemo(
    () => filterCredentials(credentials, { query, view, service }),
    [credentials, query, view, service],
  );
  const services = useMemo(() => groupServices(credentials), [credentials]);
  const searching = query.trim().length > 0;
  // The card follows the list the user can actually see, so a record hidden by a
  // search or a filter cannot leave the panel pointing at something off the list.
  const selected = selectedRecord(visible, selectedId);
  const shellPane = detailPane(pane, selected !== null);

  // A row press selects a record and, in a compact window, travels to its
  // details. See `rowPress` for what a press on the already-selected row means.
  function selectRow(id: string): void {
    const next = rowPress(selectedId, id, pane, compact);
    setSelectedId(next.selectedId);
    setPane(next.pane);
  }

  // A revealed password is a transient value, and architecture.md requires it to
  // be cleared when the selected credential changes. It keys on the record the
  // card actually shows rather than the stored id, so one that has been hidden by
  // a search or a filter drops its secret too instead of handing it back when the
  // filter clears. The card's other state goes with it: every affordance in it
  // belongs to the record it was drawn for.
  useEffect(() => {
    setDetails(idleDetails);
  }, [selected?.id]);

  const count = visible.length;
  const title = searching
    ? `“${query.trim()}”`
    : view === 'favorites'
      ? 'Favorites'
      : (service ?? 'All Passwords');
  const subtitle = searching
    ? `${count} ${count === 1 ? 'match' : 'matches'}`
    : `${count} saved ${count === 1 ? 'account' : 'accounts'}`;

  // A record the current view hides would leave the details panel pointing at
  // nothing the user can see, so a save or a jump drops the filters that exclude
  // it rather than selecting a row that is not on screen.
  function revealInPlace(record: CredentialSummary): void {
    setView((current) => (current === 'favorites' && !record.favorite ? 'all' : current));
    if (service !== null && normalizeService(service) !== normalizeService(record.service)) {
      setService(null);
    }
    if (searching && !matchesQuery(record, query)) {
      setQuery('');
    }
  }

  function openAdd(): void {
    setCard({
      mode: 'add',
      credentialId: null,
      initialValues: emptyFormValues,
      favorite: false,
      secretLoading: false,
      secretFailure: null,
      submitFailure: null,
      duplicate: null,
      busy: false,
    });
  }

  async function openEdit(credential: CredentialSummary): Promise<void> {
    const api = window.vault;
    if (api === undefined) {
      return;
    }
    // The Edit form is about to change this record, possibly including the
    // password a reveal is showing, so the card drops its transient values
    // first: one password should be in renderer state at a time.
    setDetails(idleDetails);
    setCard({
      mode: 'edit',
      credentialId: credential.id,
      initialValues: {
        ...emptyFormValues,
        service: credential.service,
        identifier: credential.identifier,
      },
      favorite: credential.favorite,
      secretLoading: true,
      secretFailure: null,
      submitFailure: null,
      duplicate: null,
      busy: false,
    });

    // The read is the only thing that can keep the card in its loading state, so
    // the `finally` below owns that release whatever the bridge answer looks like.
    try {
      const secret = await callVault(() => api.readSecret(credential.id));
      setCard((current) => {
        if (!ownsCard(current, credential.id)) {
          return current;
        }
        if (!secret.ok) {
          return { ...current, secretFailure: secret.code };
        }
        return { ...current, initialValues: formValuesFor(credential, secret.value.password) };
      });
    } finally {
      setCard((current) =>
        !ownsCard(current, credential.id) || !current.secretLoading
          ? current
          : { ...current, secretLoading: false },
      );
    }
  }

  function closeCard(): void {
    setCard(null);
  }

  async function submitCard(input: CredentialInput): Promise<void> {
    const api = window.vault;
    const editedId = card?.credentialId ?? null;
    if (api === undefined) {
      return;
    }
    setCard((current) =>
      current === null ? current : { ...current, busy: true, submitFailure: null, duplicate: null },
    );

    try {
      const result = await callVault(() =>
        editedId === null ? api.create(input) : api.update(editedId, input),
      );
      if (result.ok) {
        closeCard();
        revealInPlace(result.value);
        setSelectedId(result.value.id);
        await reload();
        return;
      }

      // The main process owns the rejection. The renderer only looks up which
      // record a duplicate points at, so the warning can offer to open it.
      setCard((current) =>
        current === null
          ? current
          : {
              ...current,
              submitFailure: result.code,
              duplicate:
                result.code === 'duplicate-credential'
                  ? (existingCollision(input, credentials, editedId) ?? null)
                  : null,
            },
      );
    } finally {
      // The card stays open only to show a problem, and it must never stay open
      // still holding the save in flight.
      setCard((current) =>
        current === null || current.credentialId !== editedId || !current.busy
          ? current
          : { ...current, busy: false },
      );
    }
  }

  function openExisting(id: string): void {
    closeCard();
    const record = credentials.find((credential) => credential.id === id);
    if (record !== undefined) {
      revealInPlace(record);
    }
    setSelectedId(id);
  }

  function openDelete(credential: CredentialSummary): void {
    setPendingDelete(credential);
    setDeleteFailure(null);
  }

  function closeDelete(): void {
    setPendingDelete(null);
    setDeleteFailure(null);
  }

  async function confirmDelete(): Promise<void> {
    const api = window.vault;
    if (api === undefined || pendingDelete === null) {
      return;
    }
    const removed = pendingDelete;
    setDeleteBusy(true);
    setDeleteFailure(null);

    try {
      const result = await callVault(() => api.remove(removed.id));
      if (result.ok || result.code === 'not-found') {
        // `not-found` means the record is already gone, which is the outcome the
        // user asked for; only a storage failure keeps the card open.
        closeDelete();
        const index = visible.findIndex((record) => record.id === removed.id);
        const next = index === -1 ? null : (visible[index + 1] ?? visible[index - 1] ?? null);
        setSelectedId(next === null || next.id === removed.id ? null : next.id);
        await reload();
        return;
      }
      setDeleteFailure(result.code);
    } finally {
      setDeleteBusy(false);
    }
  }

  // Reveal is the one affordance that keeps a password in renderer state, and it
  // keeps exactly one: pressing it again covers the value and drops it, and any
  // response for a record the user has moved away from is discarded. The
  // transitions themselves live in `lib/secret-lifecycle`, where the timing cases
  // they exist for can be read and tested as rules.
  async function toggleReveal(credential: CredentialSummary): Promise<void> {
    const api = window.vault;
    if (api === undefined) {
      return;
    }
    if (details.secret?.id === credential.id) {
      setDetails((current) => hideSecret(current, credential.id));
      return;
    }

    setDetails((current) => requestSecret(current, credential.id));
    try {
      const result = await callVault(() => api.readSecret(credential.id));
      setDetails((current) => answerSecret(current, credential.id, result));
    } finally {
      // A reveal that cannot answer still has to stop showing itself as working,
      // and it must not leave a half-read secret behind.
      setDetails((current) => releaseSecret(current, credential.id));
    }
  }

  // The star writes through the main process and the card re-reads the list it
  // comes back in, so an accepted write is never shown before it is stored.
  async function toggleFavorite(credential: CredentialSummary): Promise<void> {
    const api = window.vault;
    if (api === undefined || details.favoritePendingId !== null) {
      return;
    }
    const favorite = !credential.favorite;
    setDetails((current) => ({
      ...current,
      favoriteFailure: null,
      favoritePendingId: credential.id,
    }));

    try {
      const result = await callVault(() => api.setFavorite(credential.id, favorite));
      setDetails((current) =>
        current.favoritePendingId !== credential.id
          ? current
          : {
              ...current,
              favoritePendingId: null,
              favoriteFailure: result.ok ? null : result.code,
            },
      );

      // Favorites, the service counts and this card all read the same flag, so a
      // confirmed write refetches the list rather than patching one row locally. A
      // `not-found` means the record went out from under the card, which a reload
      // also resolves; a storage failure leaves the displayed state already true.
      if (result.ok || result.code === 'not-found') {
        await reload();
      }
    } finally {
      setDetails((current) =>
        current.favoritePendingId !== credential.id
          ? current
          : { ...current, favoritePendingId: null },
      );
    }
  }

  // Every copy affordance asks the main process to write the clipboard, because the
  // main process is the only place that copy can be read back later: Chromium will
  // not let an unfocused document read its own clipboard, and clearing a copied
  // value only matters once the user has switched away to paste it. The window
  // therefore never holds the value it copies, and copying a masked password does
  // not reveal it. The Edit form uses the same channel for the record it is open
  // on, so a password copied from inside the form is covered by the cleanup like
  // one copied from the details card.
  async function copyStoredValue(
    credentialId: string,
    field: CredentialCopyField,
  ): Promise<CopyOutcome> {
    const api = window.vault;
    if (api === undefined) {
      return 'failed';
    }
    const result = await callVault(() => api.copy(credentialId, field));
    return result.ok ? 'copied' : 'failed';
  }

  function copyCardPassword(): Promise<CopyOutcome> {
    const editedId = card?.credentialId ?? null;
    return editedId === null ? Promise.resolve('failed') : copyStoredValue(editedId, 'password');
  }

  const listBody = (): JSX.Element => {
    if (status === 'loading') {
      return (
        <p className="status-line">
          <Loader aria-hidden="true" />
          Loading saved accounts…
        </p>
      );
    }
    if (status === 'failed') {
      const copy = listFailureCopy(failure ?? 'storage-error');
      return (
        <EmptyState icon={<TriangleAlert />} title={copy.title} description={copy.description} />
      );
    }
    if (credentials.length === 0) {
      return (
        <EmptyState
          icon={<FilePlus2 />}
          title="No passwords yet"
          description="Add your first account to get started."
        />
      );
    }
    if (visible.length === 0 && searching) {
      return (
        <EmptyState
          icon={<Search />}
          title="No password found"
          description="Try searching for another service, email, or username."
        />
      );
    }
    if (visible.length === 0 && view === 'favorites') {
      return (
        <EmptyState
          icon={<Star />}
          title="No favorites yet"
          description="Mark an account with a star to keep it here."
        />
      );
    }
    if (visible.length === 0) {
      return (
        <EmptyState
          icon={<FilePlus2 />}
          title="No accounts for this service"
          description="Choose another service, or choose it again to clear the filter."
        />
      );
    }
    return <CredentialList credentials={visible} selectedId={selectedId} onSelect={selectRow} />;
  };

  const detailsBody = (): JSX.Element => {
    if (selected === null) {
      return (
        <EmptyState
          icon={<MousePointerClick />}
          title={searching ? 'Select an account' : 'No account selected'}
          description={
            searching
              ? 'Choose an account from the search results to view its credentials.'
              : 'Select an account to view its details.'
          }
        />
      );
    }
    return (
      <>
        {/* Only a compact window shows this: there the card replaces the list, so
            it has to carry its own way back. */}
        <button type="button" className="pane-back" onClick={() => setPane('list')}>
          <ChevronLeft aria-hidden="true" />
          Back
        </button>
        <CredentialDetails
          credential={selected}
          revealedPassword={details.secret?.id === selected.id ? details.secret.password : null}
          secretPending={details.secretPendingId === selected.id}
          secretFailure={details.secretFailure}
          favoritePending={details.favoritePendingId !== null}
          favoriteFailure={details.favoriteFailure}
          onToggleFavorite={canWrite ? () => void toggleFavorite(selected) : undefined}
          onToggleReveal={canWrite ? () => void toggleReveal(selected) : undefined}
          onCopyIdentifier={canWrite ? () => copyStoredValue(selected.id, 'identifier') : undefined}
          onCopyPassword={canWrite ? () => copyStoredValue(selected.id, 'password') : undefined}
          onEdit={canWrite ? () => void openEdit(selected) : undefined}
          onDelete={canWrite ? () => openDelete(selected) : undefined}
        />
      </>
    );
  };

  return (
    <>
      <AppShell
        pane={shellPane}
        sidebar={
          <Sidebar
            query={query}
            onQueryChange={setQuery}
            view={view}
            onViewChange={setView}
            services={services}
            activeService={service}
            onSelectService={setService}
            footer={
              // The note belongs to the fixtures, not to every state without a
              // vault: a broken install must not be labelled sample data.
              source === 'sample' && status === 'ready' ? (
                <span className="data-source-note">
                  <TriangleAlert aria-hidden="true" />
                  Sample data — not connected to your vault
                </span>
              ) : undefined
            }
          />
        }
        list={
          <>
            <header className="panel-head">
              <div className="panel-head-text">
                {searching && <p className="panel-eyebrow">Search results for</p>}
                <h1 className="panel-title">{title}</h1>
                <p className="panel-subtitle">{subtitle}</p>
              </div>
              <button
                type="button"
                className="button button--primary"
                disabled={!canWrite}
                aria-label={canWrite ? 'Add Password' : writeUnavailableCopy.actionLabel}
                title={canWrite ? 'Add Password' : writeUnavailableCopy.reason}
                onClick={openAdd}
              >
                <Plus aria-hidden="true" />
                <span className="button-label">Add Password</span>
              </button>
            </header>
            {listBody()}
          </>
        }
        details={detailsBody()}
      />
      {card !== null && (
        <CredentialFormModal
          mode={card.mode}
          initialValues={card.initialValues}
          favorite={card.favorite}
          secretLoading={card.secretLoading}
          secretFailure={card.secretFailure}
          submitFailure={card.submitFailure}
          duplicate={card.duplicate}
          busy={card.busy}
          onClose={closeCard}
          onSubmit={(input) => void submitCard(input)}
          onCopyPassword={copyCardPassword}
          onViewExisting={openExisting}
          onDismissDuplicate={() =>
            setCard((current) =>
              current === null ? current : { ...current, submitFailure: null, duplicate: null },
            )
          }
        />
      )}
      {pendingDelete !== null && (
        <DeleteConfirmModal
          credential={pendingDelete}
          busy={deleteBusy}
          failure={deleteFailure}
          onCancel={closeDelete}
          onConfirm={() => void confirmDelete()}
        />
      )}
    </>
  );
}
