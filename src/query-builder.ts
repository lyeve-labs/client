/**
 * Fluent query builder for LyEve CMS Content API queries.
 *
 * Produces ContentQuery objects with a chainable API. It offers only what the
 * list endpoint serves: exact-match filters, a page size and an offset or a
 * cursor. The endpoint has no sort and returns the newest entries first.
 *
 * ## Usage
 * ```ts
 * import { query } from '@lyeve-labs/client';
 *
 * const q = query('posts')
 *   .whereStatus('published')
 *   .whereEq('author', 'alice')
 *   .limit(20)
 *   .build();
 * ```
 */

export type ContentStatus = "draft" | "published" | "archived";

export interface ContentQuery {
  /** Max records per page. */
  limit?: number;
  /** Offset for offset-based pagination. Mutually exclusive with cursor. */
  offset?: number;
  /**
   * Cursor for cursor-based pagination. Mutually exclusive with offset. The
   * cursor endpoint takes no filters.
   */
  cursor?: string;
  /**
   * Field filters, sent as `filters[field]=value`. Each keeps the entries
   * whose field equals the value exactly. The status is the `_status` key.
   */
  filters?: Record<string, string>;
}

/**
 * Builder for ContentQuery objects.
 *
 * Each field can only hold one filter (Record<string, string>). Calling
 * where() or whereEq() with an already-set field name overwrites the
 * previous filter.
 */
export class QueryBuilder {
  #schema: string;
  #limit?: number;
  #offset?: number;
  #cursor?: string;
  #filters: Record<string, string> = {};

  constructor(schema: string) {
    this.#schema = schema;
  }

  /** The schema/collection this query targets. */
  get schema(): string {
    return this.#schema;
  }

  /** Filter by content status (published, draft, archived). */
  whereStatus(s: ContentStatus | undefined): this {
    if (s === undefined) delete this.#filters._status;
    else this.#filters._status = s;
    return this;
  }

  /** Add a field filter that matches the value exactly. */
  where(field: string, value: string): this {
    this.#filters[field] = value;
    return this;
  }

  /** Add a field-level equality filter. */
  whereEq(field: string, value: string | number | boolean): this {
    this.#filters[field] = String(value);
    return this;
  }

  /** Set the max records per page. */
  limit(n: number | undefined): this {
    this.#limit = n;
    return this;
  }

  /** Set the offset for offset-based pagination. Clears cursor. */
  offset(n: number | undefined): this {
    this.#offset = n;
    if (n !== undefined) this.#cursor = undefined;
    return this;
  }

  /** Set the cursor for cursor-based pagination. Clears offset. */
  cursor(c: string | undefined): this {
    this.#cursor = c;
    if (c !== undefined) this.#offset = undefined;
    return this;
  }

  /** Clear all filters, keeping only the schema name. */
  resetFilters(): this {
    this.#filters = {};
    this.#limit = undefined;
    this.#offset = undefined;
    this.#cursor = undefined;
    return this;
  }

  /** Produce the ContentQuery object. */
  build(): ContentQuery {
    return {
      limit: this.#limit,
      offset: this.#offset,
      cursor: this.#cursor,
      filters:
        Object.keys(this.#filters).length > 0
          ? { ...this.#filters }
          : undefined,
    };
  }
}

/**
 * Create a new query builder for the given schema.
 * Equivalent to `new QueryBuilder(schema)`.
 */
export function query(schema: string): QueryBuilder {
  return new QueryBuilder(schema);
}
