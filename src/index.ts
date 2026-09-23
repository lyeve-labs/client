/**
 * LyEve CMS Client : Framework-agnostic TypeScript SDK core.
 *
 * Provides the HTTP client factory, domain types, and utilities.
 * Protocol-specific packages (@lyeve-labs/client-rest,
 * @lyeve-labs/client-graphql, etc.) build on this core.
 *
 * @example
 * ```ts
 * import { createClient } from '@lyeve-labs/client';
 * import { getSchemas } from '@lyeve-labs/client-rest';
 *
 * const client = createClient(fetch, { Authorization: 'Bearer xxx' });
 * const schemas = await getSchemas(client);
 * ```
 *
 * @packageDocumentation
 */

// Core client
export { createClient, ApiError } from "./client.js";
export type { HttpClient } from "./client.js";

// Domain types
export type {
  Schema,
  SchemaField,
  SchemaTransports,
  TransportName,
  TransportMode,
  FieldType,
  Content,
  User,
  APIKey,
  CreateAPIKeyResponse,
  Webhook,
  WebhookDelivery,
  WebhookTestResult,
  RetryDeliveryResult,
  RetryConfig,
  RetryConfigInput,
  DeadLetter,
  DLQStatus,
  PaginatedResponse,
  ListResponse,
  WebhookHealthStats,
  GlobalHealthStats,
  IncomingWebhook,
  OAuthProvider,
  Permission,
  Entitlements,
} from "./types.js";

// Pagination iterator
export { PaginationIterator } from "./pagination.js";
export type {
  PaginationConfig,
  PageFetcher,
  CursorPage,
} from "./pagination.js";

// Query builder
export { QueryBuilder, query } from "./query-builder.js";
export type { ContentQuery, ContentStatus } from "./query-builder.js";

// Retry wrapper
export { createRetryFetch } from "./retry.js";
export type { RetryConfig as RetryFetchConfig } from "./retry.js";

// Request deduplication
export { RequestDeduplicator } from "./dedupe.js";
