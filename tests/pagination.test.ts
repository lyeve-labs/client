import { describe, it, expect, vi } from "vitest";
import { PaginationIterator } from "../src/pagination.js";
import type { CursorPage, PageFetcher } from "../src/pagination.js";

// helpers

/** Create a PageFetcher that returns pages from a list of CursorPage objects. */
function makePageFetcher<T>(pages: CursorPage<T>[]): PageFetcher<T> {
  const fetchPage = vi.fn(async (_cursor?: string): Promise<CursorPage<T>> => {
    // Determine which page to return based on cursor value
    // First call always gets undefined cursor
    const callCount = fetchPage.mock.calls.length - 1;
    const page = pages[callCount];
    if (!page) throw new Error("Unexpected fetchPage call - no more pages");
    return page;
  });
  return fetchPage;
}

/** Collect all items from a PaginationIterator into an array. */
async function collect<T>(iter: PaginationIterator<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iter) {
    items.push(item);
  }
  return items;
}

/** Advance microtasks so pending promise chains resolve. */
function tick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

// basic iteration

describe("PaginationIterator - basic iteration", () => {
  it("yields all items from a single page with no cursor", async () => {
    const fetchPage = makePageFetcher([{ items: ["a", "b", "c"] }]);
    const iter = new PaginationIterator<string>({ fetchPage });
    const items = await collect(iter);

    expect(items).toEqual(["a", "b", "c"]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(undefined);
  });

  it("yields items across multiple pages using cursor", async () => {
    const fetchPage = makePageFetcher([
      { items: ["a", "b"], next_cursor: "cursor-1" },
      { items: ["c", "d"], next_cursor: "cursor-2" },
      { items: ["e"] },
    ]);
    const iter = new PaginationIterator<string>({ fetchPage });
    const items = await collect(iter);

    expect(items).toEqual(["a", "b", "c", "d", "e"]);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage).toHaveBeenNthCalledWith(1, undefined);
    expect(fetchPage).toHaveBeenNthCalledWith(2, "cursor-1");
    expect(fetchPage).toHaveBeenNthCalledWith(3, "cursor-2");
  });

  it("handles an empty result set - page with no items", async () => {
    const fetchPage = makePageFetcher([{ items: [] }]);
    const iter = new PaginationIterator<string>({ fetchPage });
    const items = await collect(iter);

    expect(items).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("handles empty items with cursor - stops without fetching more", async () => {
    const fetchPage = makePageFetcher([{ items: [], next_cursor: "cursor-1" }]);
    const iter = new PaginationIterator<string>({ fetchPage });
    const items = await collect(iter);

    expect(items).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});

// for-await-of

describe("PaginationIterator - for-await-of", () => {
  it("is usable with for-await-of via Symbol.asyncIterator", async () => {
    const fetchPage = makePageFetcher([{ items: [10, 20, 30] }]);
    const iter = new PaginationIterator<number>({ fetchPage });
    const collected: number[] = [];

    for await (const n of iter) {
      collected.push(n);
    }

    expect(collected).toEqual([10, 20, 30]);
  });
});

// withSignal

describe("PaginationIterator - withSignal", () => {
  it("clones the iterator sharing cursor state but using a new signal", async () => {
    const fetchPage = makePageFetcher([
      { items: ["a", "b"], next_cursor: "next" },
      { items: ["c"] },
    ]);
    const iter = new PaginationIterator<string>({ fetchPage });

    // Advance past first item
    const first = await iter.next();
    expect(first.value).toBe("a");

    const ac = new AbortController();
    const cloned = iter.withSignal(ac.signal);

    // Clone shares buffer: should get 'b' without another fetch
    const second = await cloned.next();
    expect(second.value).toBe("b");

    // And continues to the next page via shared cursor
    const third = await cloned.next();
    expect(third.value).toBe("c");

    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("withSignal clone is aborted when the signal fires", async () => {
    const fetchPage = makePageFetcher([
      { items: ["a", "b"], next_cursor: "next" },
      { items: ["c"] },
    ]);
    const iter = new PaginationIterator<string>({ fetchPage });
    const ac = new AbortController();
    const cloned = iter.withSignal(ac.signal);

    // Consume first item from original (un-aborted)
    const first = await iter.next();
    expect(first.value).toBe("a");

    // Abort the cloned iterator's signal
    ac.abort();

    await expect(cloned.next()).rejects.toThrow();
  });
});

// AbortController integration

describe("PaginationIterator - AbortController", () => {
  it("throws AbortError when signal is already aborted", async () => {
    const ac = new AbortController();
    ac.abort();

    const fetchPage = makePageFetcher([{ items: ["a"] }]);
    const iter = new PaginationIterator<string>({ fetchPage });
    const withSignal = iter.withSignal(ac.signal);

    await expect(withSignal.next()).rejects.toThrow();
  });

  it("throws AbortError when signal fires before fetch", async () => {
    const ac = new AbortController();
    // fetchPage resolves only when we let it
    const slowFetch: PageFetcher<string> = vi.fn(
      () =>
        new Promise<CursorPage<string>>((r) =>
          setTimeout(() => r({ items: ["x"] }), 100),
        ),
    );
    const iter = new PaginationIterator<string>({ fetchPage: slowFetch });
    const withSignal = iter.withSignal(ac.signal);

    // Trigger the fetch then immediately abort
    const nextPromise = withSignal.next();
    ac.abort();

    await expect(nextPromise).rejects.toThrow();
  });

  it("stops iteration when the signal fires between pages", async () => {
    const fetchPage = makePageFetcher([
      { items: ["a", "b"], next_cursor: "next" },
      { items: ["c", "d"] },
    ]);
    const ac = new AbortController();
    const iter = new PaginationIterator<string>({ fetchPage });
    const withSignal = iter.withSignal(ac.signal);

    // Consume first page
    const a = await withSignal.next();
    expect(a.value).toBe("a");
    const b = await withSignal.next();
    expect(b.value).toBe("b");

    // Abort before fetching the next page
    ac.abort();

    await expect(withSignal.next()).rejects.toThrow();
  });
});

// return / throw protocol methods

describe("PaginationIterator - return() and throw()", () => {
  it("return() marks the iterator exhausted and clears buffer", async () => {
    const fetchPage = makePageFetcher([{ items: ["a", "b", "c"] }]);
    const iter = new PaginationIterator<string>({ fetchPage });

    // Consume one item
    const first = await iter.next();
    expect(first.value).toBe("a");

    // Early return
    const result = await iter.return!("early-stop");
    expect(result).toEqual({ value: "early-stop", done: true });

    // Subsequent next() returns done
    const after = await iter.next();
    expect(after).toEqual({ value: undefined, done: true });
  });

  it("throw() rejects with the given error", async () => {
    const fetchPage = makePageFetcher([{ items: ["a"] }]);
    const iter = new PaginationIterator<string>({ fetchPage });

    const err = new Error("oops");
    await expect(iter.throw!(err)).rejects.toThrow("oops");
  });

  it("after throw(), iterator is exhausted", async () => {
    const fetchPage = makePageFetcher([{ items: ["a", "b"] }]);
    const iter = new PaginationIterator<string>({ fetchPage });

    await iter.throw!(new Error("crash")).catch(() => {});

    const after = await iter.next();
    expect(after).toEqual({ value: undefined, done: true });
  });
});

// error handling

describe("PaginationIterator - error handling", () => {
  it("forwards errors thrown by fetchPage", async () => {
    const fetchPage = vi.fn(
      async (_cursor?: string): Promise<CursorPage<string>> => {
        throw new Error("network failure");
      },
    );
    const iter = new PaginationIterator<string>({ fetchPage });

    await expect(iter.next()).rejects.toThrow("network failure");
  });

  it("wraps a non-Error thrown value in an Error", async () => {
    const fetchPage = vi.fn(
      async (_cursor?: string): Promise<CursorPage<string>> => {
        throw "string error"; // eslint-disable-line no-throw-literal
      },
    );
    const iter = new PaginationIterator<string>({ fetchPage });

    await expect(iter.next()).rejects.toThrow("string error");
  });

  it("recovers after a page fetch error on subsequent call", async () => {
    let callCount = 0;
    const fetchPage = vi.fn(
      async (_cursor?: string): Promise<CursorPage<string>> => {
        callCount++;
        if (callCount === 1) throw new Error("transient error");
        return { items: ["recovered"] };
      },
    );
    const iter = new PaginationIterator<string>({ fetchPage });

    await expect(iter.next()).rejects.toThrow("transient error");

    // Next call should retry
    const result = await iter.next();
    expect(result.value).toBe("recovered");
  });
});

// edge cases

describe("PaginationIterator - edge cases", () => {
  it("multiple sequential next() calls past exhaustion all return done", async () => {
    const fetchPage = makePageFetcher([{ items: ["only"] }]);
    const iter = new PaginationIterator<string>({ fetchPage });

    await iter.next();
    const d1 = await iter.next();
    const d2 = await iter.next();
    const d3 = await iter.next();

    expect(d1).toEqual({ value: undefined, done: true });
    expect(d2).toEqual({ value: undefined, done: true });
    expect(d3).toEqual({ value: undefined, done: true });
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent next() calls - only one fetch at a time", async () => {
    let resolvePage!: (p: CursorPage<string>) => void;
    const fetchPage = vi.fn(
      () =>
        new Promise<CursorPage<string>>((resolve) => {
          resolvePage = resolve;
        }),
    );
    const iter = new PaginationIterator<string>({ fetchPage });

    // Two concurrent next() calls
    const next1 = iter.next();
    const next2 = iter.next();

    // Resolve the fetch
    resolvePage({ items: ["x", "y"], next_cursor: "next" });
    await tick();

    const [r1, r2] = await Promise.all([next1, next2]);
    expect(r1.value).toBe("x");
    expect(r2.value).toBe("y");
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("does not fetch a new page while items remain in the buffer", async () => {
    const fetchPage = makePageFetcher([{ items: ["a", "b", "c"] }]);
    const iter = new PaginationIterator<string>({ fetchPage });

    // Call next() three times: only 1 fetch, 3 yields from buffer
    const r1 = await iter.next();
    const r2 = await iter.next();
    const r3 = await iter.next();

    expect(r1.value).toBe("a");
    expect(r2.value).toBe("b");
    expect(r3.value).toBe("c");
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});
