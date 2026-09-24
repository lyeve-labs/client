# @lyeve-labs/client

Framework-agnostic HTTP client for the LyEve Core API. The foundation all other
SDK packages build on.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6.svg)](https://www.typescriptlang.org)

```bash
pnpm add @lyeve-labs/client
```

```ts
import { createClient } from "@lyeve-labs/client";
import { getSchemas } from "@lyeve-labs/client-rest";

const client = createClient(fetch, { Authorization: "Bearer <token>" });
const schemas = await getSchemas(client);
```

Zero dependencies. Native `fetch`. One client, every transport.

---

## What's in the box

- **Typed HTTP client:** `get`, `post`, `put`, `patch`, `delete`. All generic, all typed end-to-end.
- **ApiError:** thrown on every non-OK response. `status` and `message` always available.
- **Automatic JSON:** `Content-Type: application/json` added by default. 15s timeout via `AbortSignal`.
- **PaginationIterator:** async iterator over cursor-paginated endpoints. It fetches page after page and yields one record at a time.
- **QueryBuilder:** fluent `query(schema).where().sort().limit()` builder for content queries.
- **createRetryFetch:** automatic retry with configurable exponential backoff.
- **RequestDeduplicator:** coalesce in-flight duplicate requests into a single network call.
- **Shared types:** `Schema`, `Content`, `User`, `APIKey`, `Webhook`, and 20+ more.

## Requirements

- **Node 24** or newer

## Install

```bash
pnpm add @lyeve-labs/client
# or npm install @lyeve-labs/client
# or yarn add @lyeve-labs/client
```

## Use

```ts
import {
  createClient,
  createRetryFetch,
  PaginationIterator,
  query,
  RequestDeduplicator,
  type Content,
} from "@lyeve-labs/client";

const client = createClient(fetch, {
  Authorization: "Bearer <token>",
});

// GET
const health = await client.get<{ status: string }>("/api/v1/health");

// POST (the body is required on post, put and patch)
const created = await client.post<Content>("/api/v1/content/articles", {
  title: "Hello",
});

// Pagination: fetchPage returns { items, next_cursor }, the iterator yields records
const articles = new PaginationIterator<Content>({
  fetchPage: async (cursor) => {
    const qs = new URLSearchParams({ limit: "50" });
    if (cursor) qs.set("cursor", cursor);
    const page = await client.get<{ data?: Content[]; next_cursor?: string }>(
      `/api/v1/content/articles/cursor?${qs}`,
    );
    return { items: page.data ?? [], next_cursor: page.next_cursor };
  },
});
for await (const article of articles) {
  console.log(article.id);
}

// Query builder
const published = query("articles")
  .whereStatus("published")
  .sort("-created_at")
  .limit(20)
  .build();

// Retry
const resilient = createRetryFetch(fetch, {
  maxRetries: 3,
  baseDelay: 200,
});
const retryClient = createClient(resilient);

// Dedup
const dedup = new RequestDeduplicator();
const [a, b] = await Promise.all([
  dedup.dedup("schemas", () => client.get("/api/v1/schemas")),
  dedup.dedup("schemas", () => client.get("/api/v1/schemas")), // reuses the in-flight request
]);
```

## API

### createClient(fetchFn, defaultHeaders?)

Returns `{ get, post, put, patch, delete }`. Each method is a typed generic:

```ts
client.get<T>(url: string, init?: RequestInit): Promise<T>
client.post<T>(url: string, body: unknown, init?: RequestInit): Promise<T>
client.put<T>(url: string, body: unknown, init?: RequestInit): Promise<T>
client.patch<T>(url: string, body: unknown, init?: RequestInit): Promise<T>
client.delete<T>(url: string, init?: RequestInit): Promise<T> // a 204 resolves to undefined
```

### ApiError

`new ApiError(status, message)`. Thrown on non-OK responses.

### Types

Schema, SchemaField, FieldType, Content, User, APIKey, CreateAPIKeyResponse,
Webhook, WebhookDelivery, WebhookTestResult, RetryDeliveryResult, RetryConfig,
RetryConfigInput, DeadLetter, DLQStatus, PaginatedResponse\<T\>, ListResponse\<T\>,
WebhookHealthStats, GlobalHealthStats, IncomingWebhook, OAuthProvider,
Permission, Entitlements

### Utilities

| Export                            | Description                                   |
| --------------------------------- | --------------------------------------------- |
| `PaginationIterator<T>`           | Async iterator for cursor-paginated endpoints |
| `QueryBuilder` / `query(schema)`  | Fluent query builder for content queries      |
| `createRetryFetch(fetch, config)` | Auto-retry with exponential backoff           |
| `RequestDeduplicator`             | Deduplicate in-flight requests by key         |

## Local development

```bash
pnpm install            # install dependencies
pnpm test               # run unit tests
pnpm check              # type-check
pnpm build              # tsup + publint -> dist/
```

## Project layout

```
src/
  client.ts          # createClient
  index.ts           # public API
  types.ts           # shared TypeScript types
  pagination.ts      # PaginationIterator
  query-builder.ts   # query() / QueryBuilder
  retry.ts           # createRetryFetch
  dedupe.ts          # RequestDeduplicator
tests/               # vitest test suite
```

## Versioning

`@lyeve-labs/client` follows [SemVer](https://semver.org). While under `1.0`,
breaking changes bump the **minor** version; additive changes bump the **patch**.
Every release is logged in [`CHANGELOG.md`](CHANGELOG.md).

## Contributing

Bug reports and feature requests are welcome. See
[`CONTRIBUTING.md`](CONTRIBUTING.md) for the development setup and conventions.

## License

MIT. See [`LICENSE`](LICENSE).
