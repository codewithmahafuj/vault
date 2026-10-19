export interface CredentialIdentity {
  readonly service: string;
  readonly identifier: string;
}

// The complete value a user submits for one credential. It is shared because
// the renderer builds it, the main process validates it, and the repository
// stores it; one definition keeps those three from drifting apart.
export interface CredentialInput extends CredentialIdentity {
  readonly password: string;
  readonly notes: string | null;
  readonly favorite: boolean;
}

export interface IdentifiedCredential extends CredentialIdentity {
  readonly id: string;
}

export interface CredentialSummary extends IdentifiedCredential {
  readonly notes: string | null;
  readonly favorite: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CredentialSecret {
  readonly id: string;
  readonly password: string;
}

// The two details-card values the user can ask to put on the system clipboard.
// The name is shared because the main process gates the copy on exactly this set
// and the renderer can only ask for one of its members.
export type CredentialCopyField = 'identifier' | 'password';

// The whole payload of the copy channel: which record, and which one of its two
// copyable fields. It carries no value, because main reads the record itself and
// the clipboard answer comes back with nothing on it.
export interface CredentialCopyRequest {
  readonly id: string;
  readonly field: CredentialCopyField;
}
