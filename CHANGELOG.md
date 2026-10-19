# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0] - 2026-10-19

### Added

- Store, edit, delete and favourite credentials.
- Search across service, identifier and notes.
- Per-field AES-256-GCM encryption; the data key is protected by Electron
  `safeStorage` (operating-system encryption, DPAPI on Windows).
- Clipboard copy handled by the main process, cleared after 45 seconds
  (best effort).
- Fail-closed startup: a missing or unreadable key never creates a new vault.
- Per-user NSIS installer for Windows x64 (no administrator rights needed).
- Responsive three-panel layout.

[Unreleased]: https://github.com/codewithmahafuj/vault/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/codewithmahafuj/vault/releases/tag/v1.0.0
