# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.4] - 2026-09-02

### Changed

- CONTRIBUTING documents the branch model. It covered commits and releases but never said which branch a change starts from: work branches off `dev` and the PR goes back into `dev`, while `main` takes merges and carries the release tags.

## [0.3.3] - 2026-08-27

### Fixed
- Publishes what 0.3.2 described. That release was tagged with `package.json` left on 0.3.1, so the version never reached the registry and every consumer kept resolving 0.3.1, which still declared `expires_at` and `days_remaining` on `Entitlements`. The tag cannot move, so the same content ships as 0.3.3.

## [0.3.2] - 2026-08-20

### Changed
- `Entitlements` no longer carries `expires_at` or `days_remaining`. The engine never exposes the licence expiry over HTTP, so the SDK type stops declaring it.

## [0.3.1] - 2026-08-12

Published with no user-facing changes; repository tooling only.

## [0.3.0] - 2026-08-11

### Added

- **types:** `tenant_quota` on `Entitlements`, the maximum tenants a plan allows, where 0 means unlimited.

### Changed

- Move to node 24 and pnpm 10.33.4.

Carries the 0.2.3 changes as well. 0.2.3 was tagged but never published, so this
is the first release to reach the registry since 0.2.2.

## [0.2.3] - 2026-08-06

### Changed

- The abort test pins its backoff draw instead of sampling, which made it fail about one run in ten.

## [0.2.2] - 2026-08-04

### Fixed

- Split the `types` export condition so TypeScript resolves `.d.ts` under `import` and `.d.cts` under `require`.

## [0.2.1] - 2026-07-28

Published with no user-facing changes; repository tooling only.

## [0.2.0] - 2026-07-27

### Added

- Entitlements type now includes `expires_at` (ISO 8601 string or null) and `days_remaining` (integer) fields for license expiry display in the admin UI.

### Removed

- Entitlements `limits` field removed - numeric feature caps are enforced server-side per the offline license model.

## [0.1.1] - 2026-07-24

### Fixed

- Headers spread now correctly handles `Headers` instances and array-format header tuples, which previously produced empty objects because Headers entries are not own enumerable properties.
- Content type now includes optional `slug`, `status`, and `tenant_id` fields returned by the API.

## [0.1.0] - 2026-07-23

### Added

- Initial release.
- Framework-agnostic `HttpClient` factory and typed `ApiError` for unified error handling across all protocol-specific packages.
- Domain type definitions covering schemas, content, users, API keys, webhooks, OAuth providers, permissions, and entitlements.
- `PaginationIterator` for cursor-based and offset-based pagination over any list endpoint.
- `QueryBuilder` for constructing content queries with filters, sorting, and status selection.
- `createRetryFetch` with exponential backoff and configurable retry behavior for transient failures.
- `RequestDeduplicator` to coalesce concurrent requests for the same resource across call sites.
