import { describe, it, expect } from "vitest";
import { QueryBuilder, query } from "../src/query-builder.js";
import type { ContentQuery, ContentStatus } from "../src/query-builder.js";

// construction

describe("QueryBuilder - construction", () => {
  it("stores the schema name passed to the constructor", () => {
    const qb = new QueryBuilder("posts");
    expect(qb.schema).toBe("posts");
  });

  it("query() convenience function creates a QueryBuilder", () => {
    const qb = query("pages");
    expect(qb).toBeInstanceOf(QueryBuilder);
    expect(qb.schema).toBe("pages");
  });

  it("build() returns an empty query with no filters", () => {
    const q = new QueryBuilder("posts").build();
    expect(q.status).toBeUndefined();
    expect(q.limit).toBeUndefined();
    expect(q.offset).toBeUndefined();
    expect(q.cursor).toBeUndefined();
    expect(q.filters).toBeUndefined();
    expect(q.sort).toBeUndefined();
  });
});

// status filtering

describe("QueryBuilder - whereStatus", () => {
  it('sets the status to "published"', () => {
    const q = new QueryBuilder("articles").whereStatus("published").build();
    expect(q.status).toBe("published");
  });

  it('sets the status to "draft"', () => {
    const q = new QueryBuilder("articles").whereStatus("draft").build();
    expect(q.status).toBe("draft");
  });

  it('sets the status to "archived"', () => {
    const q = new QueryBuilder("articles").whereStatus("archived").build();
    expect(q.status).toBe("archived");
  });

  it("clears status when called with undefined", () => {
    const q = new QueryBuilder("articles")
      .whereStatus("published")
      .whereStatus(undefined)
      .build();
    expect(q.status).toBeUndefined();
  });

  it("returns this for chaining", () => {
    const qb = new QueryBuilder("x");
    expect(qb.whereStatus("published")).toBe(qb);
  });
});

// field filters

describe("QueryBuilder - where (raw operator filter)", () => {
  it("adds a filter with op:value format", () => {
    const q = new QueryBuilder("posts").where("title", "like:%hello%").build();
    expect(q.filters).toEqual({ title: "like:%hello%" });
  });

  it("accumulates multiple filters", () => {
    const q = new QueryBuilder("posts")
      .where("status", "eq:published")
      .where("author", "eq:alice")
      .build();
    expect(q.filters).toEqual({ status: "eq:published", author: "eq:alice" });
  });

  it("later calls override same field", () => {
    const q = new QueryBuilder("posts")
      .where("status", "eq:draft")
      .where("status", "eq:published")
      .build();
    expect(q.filters).toEqual({ status: "eq:published" });
  });

  it("returns this for chaining", () => {
    const qb = new QueryBuilder("x");
    expect(qb.where("a", "b")).toBe(qb);
  });
});

describe("QueryBuilder - whereEq", () => {
  it("formats a string value as eq:value", () => {
    const q = new QueryBuilder("posts").whereEq("title", "Hello").build();
    expect(q.filters).toEqual({ title: "eq:Hello" });
  });

  it("formats a number value as eq:value", () => {
    const q = new QueryBuilder("posts").whereEq("views", 42).build();
    expect(q.filters).toEqual({ views: "eq:42" });
  });

  it("formats a boolean value as eq:true/false", () => {
    const q = new QueryBuilder("posts").whereEq("featured", true).build();
    expect(q.filters).toEqual({ featured: "eq:true" });
  });

  it("returns this for chaining", () => {
    const qb = new QueryBuilder("x");
    expect(qb.whereEq("a", 1)).toBe(qb);
  });
});

describe("QueryBuilder - whereIn", () => {
  it("formats string values as JSON array", () => {
    const q = new QueryBuilder("posts")
      .whereIn("tags", ["a", "b", "c"])
      .build();
    expect(q.filters).toEqual({ tags: 'in:["a","b","c"]' });
  });

  it("formats number values as JSON array", () => {
    const q = new QueryBuilder("posts").whereIn("ratings", [1, 2, 5]).build();
    expect(q.filters).toEqual({ ratings: "in:[1,2,5]" });
  });

  it("handles an empty array", () => {
    const q = new QueryBuilder("posts").whereIn("ids", []).build();
    expect(q.filters).toEqual({ ids: "in:[]" });
  });

  it("returns this for chaining", () => {
    const qb = new QueryBuilder("x");
    expect(qb.whereIn("a", [1])).toBe(qb);
  });
});

describe("QueryBuilder - comparison filters (whereGt, whereGte, whereLt, whereLte)", () => {
  it("whereGt formats as gt:value", () => {
    const q = new QueryBuilder("posts").whereGt("views", 100).build();
    expect(q.filters).toEqual({ views: "gt:100" });
  });

  it("whereGte formats as gte:value", () => {
    const q = new QueryBuilder("posts").whereGte("views", 100).build();
    expect(q.filters).toEqual({ views: "gte:100" });
  });

  it("whereLt formats as lt:value", () => {
    const q = new QueryBuilder("posts").whereLt("views", 100).build();
    expect(q.filters).toEqual({ views: "lt:100" });
  });

  it("whereLte formats as lte:value", () => {
    const q = new QueryBuilder("posts").whereLte("views", 100).build();
    expect(q.filters).toEqual({ views: "lte:100" });
  });

  it("works with zero value", () => {
    const q = new QueryBuilder("posts").whereGt("views", 0).build();
    expect(q.filters).toEqual({ views: "gt:0" });
  });

  it("supports chaining multiple comparisons", () => {
    const q = new QueryBuilder("posts")
      .whereGte("price", 10)
      .whereLte("price", 100)
      .build();
    expect(q.filters).toEqual({ price: "lte:100" }); // last write wins
  });

  it("each returns this for chaining", () => {
    const qb = new QueryBuilder("x");
    expect(qb.whereGt("a", 1)).toBe(qb);
    expect(qb.whereGte("a", 1)).toBe(qb);
    expect(qb.whereLt("a", 1)).toBe(qb);
    expect(qb.whereLte("a", 1)).toBe(qb);
  });
});

describe("QueryBuilder - whereSearch", () => {
  it("formats as search:query", () => {
    const q = new QueryBuilder("posts")
      .whereSearch("body", "hello world")
      .build();
    expect(q.filters).toEqual({ body: "search:hello world" });
  });

  it("handles empty search query", () => {
    const q = new QueryBuilder("posts").whereSearch("body", "").build();
    expect(q.filters).toEqual({ body: "search:" });
  });

  it("returns this for chaining", () => {
    const qb = new QueryBuilder("x");
    expect(qb.whereSearch("body", "test")).toBe(qb);
  });
});

// pagination

describe("QueryBuilder - limit / offset / cursor", () => {
  it("limit sets the max records per page", () => {
    const q = new QueryBuilder("posts").limit(20).build();
    expect(q.limit).toBe(20);
  });

  it("limit(undefined) unsets the limit", () => {
    const q = new QueryBuilder("posts").limit(20).limit(undefined).build();
    expect(q.limit).toBeUndefined();
  });

  it("offset sets the offset", () => {
    const q = new QueryBuilder("posts").offset(10).build();
    expect(q.offset).toBe(10);
  });

  it("offset clears cursor when set", () => {
    const q = new QueryBuilder("posts").cursor("abc").offset(10).build();
    expect(q.offset).toBe(10);
    expect(q.cursor).toBeUndefined();
  });

  it("offset(undefined) unsets offset but does not clear cursor", () => {
    const q = new QueryBuilder("posts").cursor("abc").offset(undefined).build();
    // cursor was already set, and offset(undefined) only unsets offset
    expect(q.offset).toBeUndefined();
    expect(q.cursor).toBe("abc");
  });

  it("cursor sets the cursor value", () => {
    const q = new QueryBuilder("posts").cursor("eyJpZCI6MX0").build();
    expect(q.cursor).toBe("eyJpZCI6MX0");
  });

  it("cursor clears offset when set", () => {
    const q = new QueryBuilder("posts").offset(10).cursor("abc").build();
    expect(q.cursor).toBe("abc");
    expect(q.offset).toBeUndefined();
  });

  it("cursor(undefined) unsets cursor but does not clear offset", () => {
    const q = new QueryBuilder("posts").offset(10).cursor(undefined).build();
    expect(q.cursor).toBeUndefined();
    expect(q.offset).toBe(10);
  });

  it("cursor and offset are mutually exclusive - offset last wins", () => {
    const q = new QueryBuilder("posts").cursor("abc").offset(10).build();
    expect(q.offset).toBe(10);
    expect(q.cursor).toBeUndefined();
  });

  it("cursor and offset are mutually exclusive - cursor last wins", () => {
    const q = new QueryBuilder("posts").offset(10).cursor("abc").build();
    expect(q.cursor).toBe("abc");
    expect(q.offset).toBeUndefined();
  });

  it("each returns this for chaining", () => {
    const qb = new QueryBuilder("x");
    expect(qb.limit(10)).toBe(qb);
    expect(qb.offset(5)).toBe(qb);
    expect(qb.cursor("c")).toBe(qb);
  });
});

// sorting

describe("QueryBuilder - sort", () => {
  it("sort() with a single field", () => {
    const q = new QueryBuilder("posts").sort("created_at").build();
    expect(q.sort).toBe("created_at");
  });

  it("sort() prefix with minus for descending", () => {
    const q = new QueryBuilder("posts").sort("-created_at").build();
    expect(q.sort).toBe("-created_at");
  });

  it("sort() with multiple fields joins with commas", () => {
    const q = new QueryBuilder("posts").sort("-created_at", "title").build();
    expect(q.sort).toBe("-created_at,title");
  });

  it("sort() with three fields", () => {
    const q = new QueryBuilder("posts").sort("a", "b", "c").build();
    expect(q.sort).toBe("a,b,c");
  });

  it("sort() replaces previous sort call", () => {
    const q = new QueryBuilder("posts")
      .sort("created_at")
      .sort("title")
      .build();
    expect(q.sort).toBe("title");
  });

  it("returns this for chaining", () => {
    const qb = new QueryBuilder("x");
    expect(qb.sort("a")).toBe(qb);
  });
});

// resetFilters

describe("QueryBuilder - resetFilters", () => {
  it("clears all filters and pagination options", () => {
    const q = new QueryBuilder("posts")
      .whereStatus("published")
      .where("title", "eq:hello")
      .whereEq("author", "alice")
      .sort("-created_at")
      .limit(10)
      .offset(5)
      .resetFilters()
      .build();

    expect(q.status).toBeUndefined();
    expect(q.limit).toBeUndefined();
    expect(q.offset).toBeUndefined();
    expect(q.cursor).toBeUndefined();
    expect(q.filters).toBeUndefined();
    expect(q.sort).toBeUndefined();
  });

  it("preserves the schema after reset", () => {
    const qb = new QueryBuilder("posts");
    qb.resetFilters();
    expect(qb.schema).toBe("posts");
  });

  it("allows building a new query from scratch after reset", () => {
    const q = new QueryBuilder("posts")
      .whereStatus("draft")
      .resetFilters()
      .whereStatus("published")
      .build();
    expect(q.status).toBe("published");
  });

  it("returns this for chaining", () => {
    const qb = new QueryBuilder("x");
    expect(qb.resetFilters()).toBe(qb);
  });
});

// build output

describe("QueryBuilder - build() output", () => {
  it("returns a plain ContentQuery object (not a reference to internal state)", () => {
    const qb = new QueryBuilder("posts").where("a", "eq:1");
    const q1 = qb.build();
    const q2 = qb.build();
    // Mutating q1 should not affect q2
    (q1 as any).filters = {};
    expect(q2.filters).toEqual({ a: "eq:1" });
  });

  it("filters is undefined when no filters have been set", () => {
    const q = new QueryBuilder("posts").build();
    expect(q.filters).toBeUndefined();
  });

  it("filters contains all added filters", () => {
    const q = new QueryBuilder("posts")
      .whereEq("status", "published")
      .whereGt("views", 100)
      .build();
    expect(q.filters).toEqual({ status: "eq:published", views: "gt:100" });
  });

  it("includes status, limit, offset, cursor, and sort when set", () => {
    const q = new QueryBuilder("articles")
      .whereStatus("published")
      .sort("-updated_at")
      .limit(50)
      .offset(0)
      .build();

    expect(q).toEqual({
      status: "published",
      sort: "-updated_at",
      limit: 50,
      offset: 0,
      cursor: undefined,
      filters: undefined,
    } satisfies ContentQuery);
  });
});

// fluent chaining (end-to-end)

describe("QueryBuilder - fluent chaining (end-to-end)", () => {
  it("builds a complex query through chaining", () => {
    const q = query("posts")
      .whereStatus("published")
      .where("category", "eq:tech")
      .whereEq("author", "alice")
      .whereIn("tags", ["javascript", "typescript"])
      .whereGte("rating", 4)
      .whereLt("price", 50)
      .whereSearch("body", "react")
      .sort("-created_at", "title")
      .limit(25)
      .build();

    expect(q).toMatchObject({
      status: "published",
      filters: {
        category: "eq:tech",
        author: "eq:alice",
        tags: 'in:["javascript","typescript"]',
        rating: "gte:4",
        price: "lt:50",
        body: "search:react",
      },
      sort: "-created_at,title",
      limit: 25,
    });
  });
});
