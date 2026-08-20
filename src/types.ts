// Shared TypeScript types mirroring the backend domain models.

export interface Schema {
  name: string;
  display_name: string;
  fields: SchemaField[];
  /** Whether to include a created_at system field (TIMESTAMPTZ, auto-set on insert). */
  with_created_at?: boolean;
  /** Whether to include an updated_at system field (TIMESTAMPTZ, auto-set on update). */
  with_updated_at?: boolean;
  /** Whether content entries support draft/published/archived status. */
  with_draft_publish?: boolean;
  /** Whether to include a deleted_at soft-delete column. */
  with_soft_delete?: boolean;
  /** Whether to support per-row localization. */
  with_localization?: boolean;
  /** Canvas position : stored client-side in localStorage. */
  _pos?: { x: number; y: number };
}

export interface SchemaField {
  /** Client-side stable id for drag-and-drop : not sent to the server. */
  id?: string;
  name: string;
  field_type: FieldType;
  required: boolean;
  unique: boolean;
  indexed: boolean;
  default?: unknown;
  relation_to?: string;
  /** 'belongs_to' (FK on this table) | 'has_one' | 'has_many' | 'many_to_many' (pivot table). */
  relation_type?: "belongs_to" | "has_one" | "has_many" | "many_to_many";
  /** Override the auto-generated pivot table name (many_to_many only). */
  relation_through?: string;
  /** Override the auto-generated FK column name (belongs_to only). */
  relation_fk_name?: string;
  /** Set by the server : these fields cannot be edited or removed in the UI. */
  system?: boolean;
}

export type FieldType =
  | "text"
  | "rich_text"
  | "number"
  | "boolean"
  | "date"
  | "datetime"
  | "json"
  | "relation"
  | "media"
  | "email"
  | "url"
  | "uid";

export interface Content {
  id: string;
  schema_name: string;
  slug?: string;
  status?: string;
  data: Record<string, unknown>;
  tenant_id?: string;
  created_at: string;
  updated_at: string;
}

export interface APIKey {
  id: string;
  name: string;
  roles: string[];
  schemas: string[];
  enabled: boolean;
  monthly_limit: number;
  created_at: string;
  expires_at: string | null;
}

export interface CreateAPIKeyResponse extends APIKey {
  raw_key: string;
}

export interface Webhook {
  id: string;
  name: string;
  url: string;
  /** Subset of: before_create | after_create | before_update | after_update | before_delete | after_delete. */
  events: string[];
  /** Empty array = all schemas. */
  schemas: string[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface WebhookTestResult {
  success: boolean;
  status_code: number;
  message: string;
}

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  event_type: string;
  schema_name: string;
  status_code?: number;
  success: boolean;
  duration_ms?: number;
  request_body: string;
  error?: string;
  attempted_at: string;
  retry_count: number;
  next_retry_at?: string;
}

export interface RetryDeliveryResult {
  success: boolean;
  status_code: number;
  message: string;
  delivery_id: string;
}

export interface RetryConfig {
  id: string;
  webhook_id: string;
  max_attempts: number;
  base_delay_ms: number;
  max_delay_ms: number;
  strategy: "exponential" | "fixed" | "linear";
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export type RetryConfigInput = Partial<
  Pick<
    RetryConfig,
    "max_attempts" | "base_delay_ms" | "max_delay_ms" | "strategy" | "enabled"
  >
>;

export type DLQStatus = "pending" | "replayed" | "dismissed";

export interface DeadLetter {
  id: string;
  webhook_id: string;
  webhook_name: string;
  webhook_url: string;
  event_type: string;
  schema_name: string;
  request_body: string;
  last_status_code?: number;
  last_error?: string;
  total_attempts: number;
  status: DLQStatus;
  dead_at: string;
  replayed_at?: string;
  created_at: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface WebhookHealthStats {
  webhook_id: string;
  webhook_name: string;
  total_attempts: number;
  success_count: number;
  failed_count: number;
  exhausted_count: number;
  dlq_pending: number;
  average_duration_ms?: number;
  healthy: boolean;
}

export interface GlobalHealthStats {
  total_webhooks: number;
  healthy_webhooks: number;
  unhealthy_webhooks: number;
  pending_retries: number;
  total_dlq: number;
  pending_dlq: number;
}

export interface IncomingWebhook {
  id: string;
  name: string;
  schema_name: string;
  field_map: Record<string, string>;
  enabled: boolean;
  allowed_ips: string[];
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  email: string;
  roles: string[];
  tenant_id: string;
  disabled: boolean;
  created_at: string;
  expires_at?: string | null;
}

export interface ListResponse<T> {
  items: T[];
  total?: number;
}

export interface OAuthProvider {
  id: string;
  name: string;
  client_id: string;
  /** Not returned by the server : only sent on create/update. */
  client_secret?: string;
  issuer_url: string;
  scopes: string[];
  roles_claim: string;
  default_roles: string[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface Permission {
  id: string;
  role: string;
  schema_name: string;
  /** Subset of: create | read | update | delete. */
  actions: string[];
  /** Field names stripped from read responses for this role. */
  field_mask: string[];
  created_at: string;
}

/**
 * License entitlement snapshot : mirrors the Go `license.Snapshot` returned by
 * GET /api/admin/entitlements. Drives free-tier UI gating and upgrade prompts.
 */
export interface Entitlements {
  /** Active plan, "free" when unlicensed. */
  plan: string;
  /** License state: free | active | grace | expired. */
  state: string;
  /**
   * Entitled feature names, matched verbatim. These are unprefixed and
   * kebab-case ("rbac", "schema-ui", "cache-redis"): the plugin name, or the
   * SKU minus its "plugin-" prefix. A "feature:"-prefixed id matches nothing.
   */
  features: string[];
  /** Maximum tenants this plan allows; 0 means unlimited. */
  tenant_quota: number;
}
