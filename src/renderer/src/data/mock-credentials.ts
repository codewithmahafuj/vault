import type { CredentialSummary } from '../../../shared/credential';

// Fictional fixtures only, per code-standards.md. They stand in for the vault
// when the preload bridge is absent, which happens in `npm run dev` without a
// main process, in tests, and in any browser preview; the UI is labelled as
// sample data whenever they are on screen.
export const mockCredentials: readonly CredentialSummary[] = [
  {
    id: 'sample-google',
    service: 'Google',
    identifier: 'maya.raines@example.com',
    notes: 'Recovery email set to the work address.',
    favorite: true,
    createdAt: '2026-07-04T09:12:00.000Z',
    updatedAt: '2026-09-28T15:41:00.000Z',
  },
  {
    id: 'sample-microsoft',
    service: 'Microsoft',
    identifier: 'maya.raines@example.com',
    notes: null,
    favorite: true,
    createdAt: '2026-06-19T11:05:00.000Z',
    updatedAt: '2026-08-02T08:30:00.000Z',
  },
  {
    id: 'sample-facebook',
    service: 'Facebook',
    identifier: '+1 555 0104',
    notes: 'Birthday hidden from the public profile.',
    favorite: false,
    createdAt: '2026-05-30T18:22:00.000Z',
    updatedAt: '2026-05-30T18:22:00.000Z',
  },
  {
    id: 'sample-instagram',
    service: 'Instagram',
    identifier: 'maya.r',
    notes: null,
    favorite: false,
    createdAt: '2026-05-12T07:48:00.000Z',
    updatedAt: '2026-10-01T19:04:00.000Z',
  },
  {
    id: 'sample-linkedin',
    service: 'LinkedIn',
    identifier: 'maya.raines@example.com',
    notes: 'Two-step verification uses the authenticator app.',
    favorite: false,
    createdAt: '2026-04-27T13:16:00.000Z',
    updatedAt: '2026-07-16T10:52:00.000Z',
  },
  {
    id: 'sample-github',
    service: 'GitHub',
    identifier: 'maya-raines',
    notes: 'Personal account; no billing information stored.',
    favorite: true,
    createdAt: '2026-03-08T20:31:00.000Z',
    updatedAt: '2026-09-11T09:27:00.000Z',
  },
  {
    id: 'sample-youtube',
    service: 'YouTube',
    identifier: 'maya.raines@example.com',
    notes: null,
    favorite: false,
    createdAt: '2026-02-14T16:09:00.000Z',
    updatedAt: '2026-02-14T16:09:00.000Z',
  },
  {
    id: 'sample-amazon',
    service: 'Amazon',
    identifier: '+44 7700 900217',
    notes: 'Prime membership renews in March.',
    favorite: false,
    createdAt: '2026-01-23T12:44:00.000Z',
    updatedAt: '2026-08-29T06:18:00.000Z',
  },
  {
    id: 'sample-notion',
    service: 'Notion',
    identifier: 'maya.raines@example.com',
    notes: 'Workspace: personal knowledge base.',
    favorite: false,
    createdAt: '2025-12-30T10:02:00.000Z',
    updatedAt: '2026-06-05T14:36:00.000Z',
  },
];
