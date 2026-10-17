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
    expect(q.limit).toBeUndefined();
    expect(q.offset).toBeUndefined();
    expect(q.cursor).toBeUndefined();
    expect(q.filters).toBeUndefined();
  });
});

// the engine's list API

describe("QueryBuilder - matches the engine's list API", () => {
  it("sends an equality filter as the bare value the engine compares", () => {
    const q = new QueryBuilder("posts").whereEq("title", "Hello").build();
    expect(q.filters).toEqual({ title: "Hello" });
  });

  it("sends the status as the _status filter the engine reads", () => {
    const q = new QueryBuilder("posts").whereStatus("draft").build();
    expect(q.filters).toEqual({ _status: "draft" });
    expect(q).not.toHaveProperty("status");
  });

  it("offers no sort, range, set or search the engine would ignore or refuse", () => {
    const qb = new QueryBuilder("posts");
    for (const name of [
      "sort",
      "whereGt",
      "whereGte",
      "whereLt",
      "whereLte",
      "whereIn",
      "whereSearch",
    ]) {
      expect(qb).not.toHaveProperty(name);
    }
    expect(qb.build()).not.toHaveProperty("sort");
  });
});

// status filtering

describe("QueryBuilder - whereStatus", () => {
  it('sets the status to "published"', () => {
    const q = new QueryBuilder("articles").whereStatus("published").build();
    expect(q.filters).toEqual({ _status: "published" });
  });

  it('sets the status to "draft"', () => {
    const q = new QueryBuilder("articles").whereStatus("draft").build();
    expect(q.filters).toEqual({ _status: "draft" });
  });

  it('sets the status to "archived"', () => {
    const q = new QueryBuilder("articles").whereStatus("archived").build();
    expect(q.filters).toEqual({ _status: "archived" });
  });

  it("clears status when called with undefined", () => {
    const q = new QueryBuilder("articles")
      .whereStatus("published")
      .whereStatus(undefined)
      .build();
    expect(q.filters).toBeUndefined();
  });

  it("returns this for chaining", () => {
    const qb = new QueryBuilder("x");
    expect(qb.whereStatus("published")).toBe(qb);
  });
});

// field filters

describe("QueryBuilder - where", () => {
  it("adds a filter with the value as given", () => {
    const q = new QueryBuilder("posts").where("title", "hello").build();
    expect(q.filters).toEqual({ title: "hello" });
  });

  it("accumulates multiple filters", () => {
    const q = new QueryBuilder("posts")
      .where("category", "tech")
      .where("author", "alice")
      .build();
    expect(q.filters).toEqual({ category: "tech", author: "alice" });
  });

  it("later calls override same field", () => {
    const q = new QueryBuilder("posts")
      .where("category", "news")
      .where("category", "tech")
      .build();
    expect(q.filters).toEqual({ category: "tech" });
  });

  it("returns this for chaining", () => {
    const qb = new QueryBuilder("x");
    expect(qb.where("a", "b")).toBe(qb);
  });
});

describe("QueryBuilder - whereEq", () => {
  it("keeps a string value as given", () => {
    const q = new QueryBuilder("posts").whereEq("title", "Hello").build();
    expect(q.filters).toEqual({ title: "Hello" });
  });

  it("formats a number value as a string", () => {
    const q = new QueryBuilder("posts").whereEq("views", 42).build();
    expect(q.filters).toEqual({ views: "42" });
  });

  it("formats a boolean value as true or false", () => {
    const q = new QueryBuilder("posts").whereEq("featured", true).build();
    expect(q.filters).toEqual({ featured: "true" });
  });

  it("returns this for chaining", () => {
    const qb = new QueryBuilder("x");
    expect(qb.whereEq("a", 1)).toBe(qb);
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

// resetFilters

describe("QueryBuilder - resetFilters", () => {
  it("clears all filters and pagination options", () => {
    const q = new QueryBuilder("posts")
      .whereStatus("published")
      .where("title", "hello")
      .whereEq("author", "alice")
      .limit(10)
      .offset(5)
      .resetFilters()
      .build();

    expect(q.limit).toBeUndefined();
    expect(q.offset).toBeUndefined();
    expect(q.cursor).toBeUndefined();
    expect(q.filters).toBeUndefined();
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
    expect(q.filters).toEqual({ _status: "published" });
  });

  it("returns this for chaining", () => {
    const qb = new QueryBuilder("x");
    expect(qb.resetFilters()).toBe(qb);
  });
});

// build output

describe("QueryBuilder - build() output", () => {
  it("returns a plain ContentQuery object (not a reference to internal state)", () => {
    const qb = new QueryBuilder("posts").where("a", "1");
    const q1 = qb.build();
    const q2 = qb.build();
    // Mutating q1 should not affect q2
    (q1 as any).filters = {};
    expect(q2.filters).toEqual({ a: "1" });
  });

  it("filters is undefined when no filters have been set", () => {
    const q = new QueryBuilder("posts").build();
    expect(q.filters).toBeUndefined();
  });

  it("filters contains all added filters", () => {
    const q = new QueryBuilder("posts")
      .whereEq("category", "tech")
      .whereEq("views", 100)
      .build();
    expect(q.filters).toEqual({ category: "tech", views: "100" });
  });

  it("includes the status filter, limit, offset and cursor when set", () => {
    const q = new QueryBuilder("articles")
      .whereStatus("published")
      .limit(50)
      .offset(0)
      .build();

    expect(q).toEqual({
      limit: 50,
      offset: 0,
      cursor: undefined,
      filters: { _status: "published" },
    } satisfies ContentQuery);
  });
});

// fluent chaining (end-to-end)

describe("QueryBuilder - fluent chaining (end-to-end)", () => {
  it("builds a complex query through chaining", () => {
    const q = query("posts")
      .whereStatus("published")
      .where("category", "tech")
      .whereEq("author", "alice")
      .whereEq("rating", 4)
      .limit(25)
      .build();

    expect(q).toMatchObject({
      filters: {
        _status: "published",
        category: "tech",
        author: "alice",
        rating: "4",
      },
      limit: 25,
    });
  });
});
