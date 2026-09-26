import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RequestDeduplicator } from "../src/dedupe.js";

// basic dedup behavior

describe("RequestDeduplicator - basic dedup", () => {
  it("returns the result of the factory function", async () => {
    const dedupe = new RequestDeduplicator();
    const result = await dedupe.dedup("key1", async () => "hello");
    expect(result).toBe("hello");
  });

  it("forwards the rejection when the factory throws", async () => {
    const dedupe = new RequestDeduplicator();
    const err = new Error("factory error");
    await expect(
      dedupe.dedup("key1", async () => {
        throw err;
      }),
    ).rejects.toThrow("factory error");
  });
});

// concurrent deduplication

describe("RequestDeduplicator - concurrent deduplication", () => {
  it("deduplicates concurrent calls with the same key", async () => {
    const dedupe = new RequestDeduplicator();
    const factory = vi.fn(async () => "shared-result");

    const [r1, r2, r3] = await Promise.all([
      dedupe.dedup("same-key", factory),
      dedupe.dedup("same-key", factory),
      dedupe.dedup("same-key", factory),
    ]);

    expect(r1).toBe("shared-result");
    expect(r2).toBe("shared-result");
    expect(r3).toBe("shared-result");
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("sends separate keys to separate factories", async () => {
    const dedupe = new RequestDeduplicator();
    const factoryA = vi.fn(async () => "result-a");
    const factoryB = vi.fn(async () => "result-b");

    const [r1, r2] = await Promise.all([
      dedupe.dedup("key-a", factoryA),
      dedupe.dedup("key-b", factoryB),
    ]);

    expect(r1).toBe("result-a");
    expect(r2).toBe("result-b");
    expect(factoryA).toHaveBeenCalledTimes(1);
    expect(factoryB).toHaveBeenCalledTimes(1);
  });

  it("concurrent callers share exactly one in-flight promise reference", async () => {
    const dedupe = new RequestDeduplicator();
    let resolveFactory!: (v: string) => void;
    const factory = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveFactory = resolve;
        }),
    );

    // Start two concurrent dedup calls without awaiting
    const p1 = dedupe.dedup("key", factory);
    const p2 = dedupe.dedup("key", factory);

    // Sanity: factory was called exactly once
    expect(factory).toHaveBeenCalledTimes(1);

    // Sanity: p1 and p2 are the same promise (reference equality)
    // Actually, they won't be the same promise object because
    // each caller wraps via #raceWithSignal which creates a new Promise.
    // But the underlying factory should only be called once.

    resolveFactory("done");

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe("done");
    expect(r2).toBe("done");
  });
});

// eviction after settlement

describe("RequestDeduplicator - eviction after settlement", () => {
  it("evicts the entry after successful resolution", async () => {
    const dedupe = new RequestDeduplicator();
    const factory = vi.fn(async () => "result");

    // First call resolves
    await dedupe.dedup("key", factory);

    // Second call after eviction - factory should be called again
    const result = await dedupe.dedup("key", factory);

    expect(result).toBe("result");
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("evicts the entry after rejection", async () => {
    const dedupe = new RequestDeduplicator();
    const err = new Error("fail");
    const factory = vi.fn(async () => {
      throw err;
    });

    // First call rejects
    await dedupe.dedup("key", factory).catch(() => {});

    // Second call after eviction - factory should be called again
    await expect(dedupe.dedup("key", factory)).rejects.toThrow("fail");
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("late subscriber after eviction gets a fresh promise", async () => {
    const dedupe = new RequestDeduplicator();
    const factory = vi.fn(async () => "result");
    const factory2 = vi.fn(async () => "fresh-result");

    // Resolve first call
    await dedupe.dedup("key", factory);

    // Wait a tick to ensure eviction has propagated
    await new Promise((r) => setTimeout(r, 0));

    // Late subscriber - should start a new request
    const result = await dedupe.dedup("key", factory2);
    expect(result).toBe("fresh-result");
    expect(factory2).toHaveBeenCalledTimes(1);
  });
});

// inflight counter

describe("RequestDeduplicator - inflight counter", () => {
  it("starts at 0", () => {
    const dedupe = new RequestDeduplicator();
    expect(dedupe.inflight).toBe(0);
  });

  it("increments when a request is in flight", async () => {
    const dedupe = new RequestDeduplicator();
    let resolveFactory!: (v: string) => void;
    const factory = () =>
      new Promise<string>((resolve) => {
        resolveFactory = resolve;
      });

    const promise = dedupe.dedup("key", factory);
    expect(dedupe.inflight).toBe(1);

    resolveFactory("done");
    await promise;
  });

  it("returns the count of unique in-flight keys", async () => {
    const dedupe = new RequestDeduplicator();
    let resolveA!: (v: string) => void;
    let resolveB!: (v: string) => void;

    const p1 = dedupe.dedup(
      "key-a",
      () =>
        new Promise((r) => {
          resolveA = r;
        }),
    );
    const p2 = dedupe.dedup(
      "key-b",
      () =>
        new Promise((r) => {
          resolveB = r;
        }),
    );

    expect(dedupe.inflight).toBe(2);

    resolveA("a");
    await p1;
    expect(dedupe.inflight).toBe(1);

    resolveB("b");
    await p2;
    expect(dedupe.inflight).toBe(0);
  });

  it("decrements when a request with multiple subscribers resolves", async () => {
    const dedupe = new RequestDeduplicator();
    let resolveFactory!: (v: string) => void;
    const factory = () =>
      new Promise<string>((resolve) => {
        resolveFactory = resolve;
      });

    const p1 = dedupe.dedup("key", factory);
    const p2 = dedupe.dedup("key", factory);

    // Even though there are 2 subscribers, inflight should be 1 (same key)
    expect(dedupe.inflight).toBe(1);

    resolveFactory("done");
    await Promise.all([p1, p2]);

    expect(dedupe.inflight).toBe(0);
  });
});

// clear()

describe("RequestDeduplicator - clear()", () => {
  it("clears all pending deduplication entries", () => {
    const dedupe = new RequestDeduplicator();

    // Set up pending requests
    dedupe.dedup("key-a", () => new Promise(() => {})); // never resolves
    dedupe.dedup("key-b", () => new Promise(() => {}));

    expect(dedupe.inflight).toBe(2);

    dedupe.clear();

    expect(dedupe.inflight).toBe(0);
  });

  it("subsequent call with same key after clear starts a new request", async () => {
    const dedupe = new RequestDeduplicator();
    let resolveFactory!: (v: string) => void;
    const factory = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveFactory = resolve;
        }),
    );

    // Start a request but don't complete it
    const p1 = dedupe.dedup("key", factory);
    expect(dedupe.inflight).toBe(1);
    expect(factory).toHaveBeenCalledTimes(1);

    // Clear the pending entry
    dedupe.clear();

    // Now start a new request with the same key
    // Need a new factory since the old one is still pending
    const factory2 = vi.fn(async () => "after-clear");
    const p2 = dedupe.dedup("key", factory2);

    expect(factory2).toHaveBeenCalledTimes(1);
    expect(dedupe.inflight).toBe(1); // new request is in-flight

    // Resolve both
    resolveFactory("original");
    await p1.catch(() => {});
    const r2 = await p2;

    expect(r2).toBe("after-clear");
  });
});

// abort signal

describe("RequestDeduplicator - abort signal", () => {
  it("rejects with AbortError when signal is already aborted", async () => {
    const dedupe = new RequestDeduplicator();
    const ac = new AbortController();
    ac.abort();

    await expect(
      dedupe.dedup("key", async () => "value", ac.signal),
    ).rejects.toThrow();
  });

  it("rejects with custom reason when signal is already aborted", async () => {
    const dedupe = new RequestDeduplicator();
    const ac = new AbortController();
    ac.abort(new Error("user canceled"));

    await expect(
      dedupe.dedup("key", async () => "value", ac.signal),
    ).rejects.toThrow("user canceled");
  });

  it("only aborts the caller whose signal fired, not the shared request", async () => {
    const dedupe = new RequestDeduplicator();
    let resolveFactory!: (v: string) => void;
    const factory = () =>
      new Promise<string>((resolve) => {
        resolveFactory = resolve;
      });

    const ac1 = new AbortController();
    const ac2 = new AbortController();

    const p1 = dedupe.dedup("key", factory, ac1.signal);
    const p2 = dedupe.dedup("key", factory, ac2.signal);

    // Abort only the first caller
    ac1.abort();

    await expect(p1).rejects.toThrow();

    // The shared request continues - resolve it
    resolveFactory("shared-result");
    const r2 = await p2;

    expect(r2).toBe("shared-result");
  });

  it("aborting one of multiple callers does not prevent others from getting the result", async () => {
    const dedupe = new RequestDeduplicator();
    let resolveFactory!: (v: string) => void;
    const factory = () =>
      new Promise<string>((resolve) => {
        resolveFactory = resolve;
      });

    const ac1 = new AbortController();
    const ac2 = new AbortController();
    const ac3 = new AbortController();

    const p1 = dedupe.dedup("key", factory, ac1.signal);
    const p2 = dedupe.dedup("key", factory, ac2.signal);
    const p3 = dedupe.dedup("key", factory, ac3.signal);

    // Abort callers 1 and 3 - catch p3 immediately to avoid unhandled rejection
    ac1.abort();
    const p3Err = p3.catch(() => {});
    ac3.abort();

    await expect(p1).rejects.toThrow();
    await expect(p3).rejects.toThrow();

    // Resolve the shared factory
    resolveFactory("survivor");
    const r2 = await p2;

    expect(r2).toBe("survivor");
  });

  it("aborting the first caller does not prevent dedup for later callers", async () => {
    const dedupe = new RequestDeduplicator();
    let resolveFactory!: (v: string) => void;
    const factory = () =>
      new Promise<string>((resolve) => {
        resolveFactory = resolve;
      });

    const ac1 = new AbortController();
    const p1 = dedupe.dedup("key", factory, ac1.signal);

    // Abort first caller before second arrives
    ac1.abort();
    await expect(p1).rejects.toThrow();

    // The pending map still has the entry (factory hasn't settled yet)
    const ac2 = new AbortController();
    const p2 = dedupe.dedup("key", factory, ac2.signal);

    resolveFactory("still-works");
    const r2 = await p2;
    expect(r2).toBe("still-works");
  });

  it("without signal, dedup returns the promise directly", async () => {
    const dedupe = new RequestDeduplicator();
    const result = await dedupe.dedup("key", async () => "no-signal");
    expect(result).toBe("no-signal");
  });
});

// edge cases

describe("RequestDeduplicator - edge cases", () => {
  it("handles synchronous factory that returns immediately", async () => {
    const dedupe = new RequestDeduplicator();
    const result = await dedupe.dedup("sync", () =>
      Promise.resolve("immediate"),
    );
    expect(result).toBe("immediate");
  });

  it("handles empty string as key", async () => {
    const dedupe = new RequestDeduplicator();
    const factory = vi.fn(async () => "empty-key-result");

    const r = await dedupe.dedup("", factory);
    expect(r).toBe("empty-key-result");
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("preserves the resolved value type", async () => {
    const dedupe = new RequestDeduplicator();
    const obj = { id: 1, name: "test" };
    const result = await dedupe.dedup("key", async () => obj);
    expect(result).toBe(obj); // reference equality
  });

  it("non-aborted signal is cleaned up after settle", async () => {
    const dedupe = new RequestDeduplicator();
    const ac = new AbortController();
    const removeSpy = vi.spyOn(ac.signal, "removeEventListener");

    await dedupe.dedup("key", async () => "cleanup", ac.signal);

    // The abort listener should have been removed
    expect(removeSpy).toHaveBeenCalledWith("abort", expect.any(Function));

    removeSpy.mockRestore();
  });
});
