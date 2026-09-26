import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRetryFetch } from "../src/retry.js";
import type { RetryConfig } from "../src/retry.js";

// helpers

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Create a fetch mock that returns the given status for the first N calls
 *  then switches to a success response. */
function sequentialFetch(...statuses: number[]): ReturnType<typeof vi.fn> {
  let idx = 0;
  return vi.fn(
    async (
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ): Promise<Response> => {
      if (idx >= statuses.length) {
        return jsonResponse({ ok: true });
      }
      const s = statuses[idx++];
      if (s < 0) {
        throw new Error(`Simulated network error ${s}`);
      }
      return jsonResponse({ error: `status ${s}` }, s);
    },
  );
}

// Since jitter uses Math.random(), fix it for deterministic delay calculations.
const MOCK_RANDOM = 0.5;

function setupDeterministicTimers() {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(MOCK_RANDOM);
}

function cleanupTimers() {
  vi.useRealTimers();
  vi.restoreAllMocks();
}

// success (no retry)

describe("createRetryFetch - success without retry", () => {
  it("passes through a successful response (200)", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ ok: true }));
    const retrying = createRetryFetch(fetchFn);

    const res = await retrying("https://api.example.com/data");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("passes through success statuses not in retryOn list", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({}, 201));
    const retrying = createRetryFetch(fetchFn);

    const res = await retrying("https://api.example.com/data");

    expect(res.status).toBe(201);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("passes through 404 without retry", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ error: "not found" }, 404),
    );
    const retrying = createRetryFetch(fetchFn);

    const res = await retrying("https://api.example.com/missing");

    expect(res.status).toBe(404);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("forwards the URL and init to the underlying fetch", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ ok: true }));
    const retrying = createRetryFetch(fetchFn);
    const init: RequestInit = {
      method: "POST",
      headers: { "X-Custom": "v" },
      body: "test",
    };

    await retrying("https://api.example.com/data", init);

    expect(fetchFn).toHaveBeenCalledWith("https://api.example.com/data", init);
  });
});

// retry on HTTP status

describe("createRetryFetch - retry on HTTP status codes", () => {
  beforeEach(() => {
    setupDeterministicTimers();
  });

  afterEach(() => {
    cleanupTimers();
  });

  it("retries on 503 and succeeds on third attempt", async () => {
    const fetchFn = sequentialFetch(503, 503, 200);
    const onRetry = vi.fn();
    const retrying = createRetryFetch(fetchFn, { onRetry, maxRetries: 3 });

    // Start the request - it will hang on the first sleep
    const resPromise = retrying("https://api.example.com/data");

    // Advance time through first retry (500ms delay at base=1000, random=0.5)
    await vi.advanceTimersByTimeAsync(500);
    // Advance through second retry (1000ms delay for attempt 1)
    await vi.advanceTimersByTimeAsync(1000);

    const res = await resPromise;
    expect(res.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it("retries on 429 (rate limited)", async () => {
    const fetchFn = sequentialFetch(429, 200);
    const retrying = createRetryFetch(fetchFn, { maxRetries: 2 });

    const resPromise = retrying("https://api.example.com/data");
    await vi.advanceTimersByTimeAsync(500);

    const res = await resPromise;
    expect(res.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("retries on 500, 502, 503, 504", async () => {
    const fetchFn = sequentialFetch(500, 502, 503, 504, 200);
    const retrying = createRetryFetch(fetchFn, { maxRetries: 4 });

    const resPromise = retrying("https://api.example.com/data");
    // 500ms + 1000ms + 2000ms + 4000ms (but capped at 30000)
    await vi.advanceTimersByTimeAsync(7500);

    const res = await resPromise;
    expect(res.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(5);
  });

  it("exhausts max retries and returns the last response", async () => {
    const fetchFn = sequentialFetch(503, 503, 503);
    const retrying = createRetryFetch(fetchFn, { maxRetries: 2 });

    const resPromise = retrying("https://api.example.com/data");
    await vi.advanceTimersByTimeAsync(1500);

    const res = await resPromise;
    expect(res.status).toBe(503);
    expect(fetchFn).toHaveBeenCalledTimes(3); // initial + 2 retries = 3
  });

  it("does not retry when retryOn is an empty array", async () => {
    const fetchFn = sequentialFetch(503, 200);
    const retrying = createRetryFetch(fetchFn, { retryOn: [], maxRetries: 3 });

    const res = await retrying("https://api.example.com/data");

    expect(res.status).toBe(503);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("respects custom retryOn with 418 status", async () => {
    const fetchFn = sequentialFetch(418, 200);
    const retrying = createRetryFetch(fetchFn, {
      retryOn: [418, 503],
      maxRetries: 2,
    });

    const resPromise = retrying("https://api.example.com/data");
    await vi.advanceTimersByTimeAsync(500);

    const res = await resPromise;
    expect(res.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

// retry on network errors

describe("createRetryFetch - retry on network errors", () => {
  beforeEach(() => {
    setupDeterministicTimers();
  });

  afterEach(() => {
    cleanupTimers();
  });

  it("retries on network errors by default", async () => {
    let callCount = 0;
    const fetchFn = vi.fn(async () => {
      callCount++;
      if (callCount <= 2) throw new Error("Network failure");
      return jsonResponse({ ok: true });
    });
    const retrying = createRetryFetch(fetchFn, { maxRetries: 3 });

    const resPromise = retrying("https://api.example.com/data");
    await vi.advanceTimersByTimeAsync(1500);

    const res = await resPromise;
    expect(res.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it("does not retry on network errors when retryOnNetworkError is false", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("Network failure");
    });
    const retrying = createRetryFetch(fetchFn, {
      retryOnNetworkError: false,
      maxRetries: 3,
    });

    await expect(retrying("https://api.example.com/data")).rejects.toThrow(
      "Network failure",
    );
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("exhausts retries on persistent network errors", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("Network failure");
    });
    const retrying = createRetryFetch(fetchFn, { maxRetries: 2 });

    const resPromise = retrying("https://api.example.com/data").catch(
      (e: unknown) => e,
    );
    await vi.advanceTimersByTimeAsync(1500);

    const err = await resPromise;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("Network failure");
    expect(fetchFn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });
});

// onRetry callback

describe("createRetryFetch - onRetry callback", () => {
  beforeEach(() => {
    setupDeterministicTimers();
  });

  afterEach(() => {
    cleanupTimers();
  });

  it("calls onRetry with attempt number, error, and delay", async () => {
    const fetchFn = sequentialFetch(503, 200);
    const onRetry = vi.fn();
    const retrying = createRetryFetch(fetchFn, { onRetry, maxRetries: 2 });

    const resPromise = retrying("https://api.example.com/data");
    await vi.advanceTimersByTimeAsync(500);

    const res = await resPromise;
    expect(res.status).toBe(200);

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(
      1,
      expect.any(Error),
      expect.any(Number),
    );
    const [, , delay] = onRetry.mock.calls[0];
    expect(delay).toBeGreaterThanOrEqual(0);
  });

  it("calls onRetry once per retry", async () => {
    const fetchFn = sequentialFetch(503, 502, 200);
    const onRetry = vi.fn();
    const retrying = createRetryFetch(fetchFn, { onRetry, maxRetries: 3 });

    const resPromise = retrying("https://api.example.com/data");
    await vi.advanceTimersByTimeAsync(1500);

    await resPromise;

    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry.mock.calls[0][0]).toBe(1);
    expect(onRetry.mock.calls[1][0]).toBe(2);
  });

  it("onRetry receives the error from the failed attempt", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("dns failure");
    });
    const onRetry = vi.fn();
    const retrying = createRetryFetch(fetchFn, { onRetry, maxRetries: 1 });

    const resPromise = retrying("https://api.example.com/data").catch(() => {});
    await vi.advanceTimersByTimeAsync(500);
    await resPromise;

    expect(onRetry).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ message: "dns failure" }),
      expect.any(Number),
    );
  });
});

// abort signal

describe("createRetryFetch - abort signal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("aborts the request when the signal fires during sleep", async () => {
    // backoff() is full jitter: random(0, base * 2^attempt). With the default
    // 1000ms base the first window is 0-999ms, so advancing 100ms slept through
    // it about one run in ten and the request completed before the abort. Pin
    // the draw so the abort lands inside the window every time.
    const random = vi.spyOn(Math, "random").mockReturnValue(0.99);
    try {
      const fetchFn = sequentialFetch(503, 200);
      const retrying = createRetryFetch(fetchFn, {
        maxRetries: 3,
        baseDelay: 10_000,
      });
      const ac = new AbortController();

      const resPromise = retrying("https://api.example.com/data", {
        signal: ac.signal,
      });

      // Advance past the first fetch; the retry loop is now sleeping ~9.9s.
      await vi.advanceTimersByTimeAsync(100);

      // Abort during the backoff window.
      ac.abort();

      await expect(resPromise).rejects.toThrow();
    } finally {
      random.mockRestore();
    }
  });

  it("throws when signal is already aborted before the call", async () => {
    const fetchFn = vi.fn(async (_input, init) => {
      if (
        (init as RequestInit)?.signal &&
        ((init as RequestInit).signal as AbortSignal).aborted
      ) {
        throw ((init as RequestInit).signal as AbortSignal).reason;
      }
      return jsonResponse({ ok: true });
    });
    const retrying = createRetryFetch(fetchFn, { maxRetries: 3 });
    const ac = new AbortController();
    ac.abort();

    await expect(
      retrying("https://api.example.com/data", { signal: ac.signal }),
    ).rejects.toThrow();

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("propagates a custom abort reason", async () => {
    const fetchFn = vi.fn(async (_input, init) => {
      if (
        (init as RequestInit)?.signal &&
        ((init as RequestInit).signal as AbortSignal).aborted
      ) {
        throw ((init as RequestInit).signal as AbortSignal).reason;
      }
      return jsonResponse({ ok: true });
    });
    const retrying = createRetryFetch(fetchFn, { maxRetries: 3 });
    const ac = new AbortController();
    ac.abort(new Error("Canceled by user"));

    await expect(
      retrying("https://api.example.com/data", { signal: ac.signal }),
    ).rejects.toThrow("Canceled by user");
  });
});

// body cloning

describe("createRetryFetch - body cloning on retry", () => {
  beforeEach(() => {
    setupDeterministicTimers();
  });

  afterEach(() => {
    cleanupTimers();
  });

  it("clones the request body on retry so it can be re-sent", async () => {
    let callCount = 0;
    const fetchFn = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        callCount++;
        if (callCount === 1) return jsonResponse({ error: "fail" }, 503);
        if (callCount === 2) return jsonResponse({ error: "fail" }, 503);
        // Third call - check body is still available
        const body = init?.body;
        expect(body).toBeTruthy();
        return jsonResponse({ ok: true });
      },
    );
    const retrying = createRetryFetch(fetchFn, { maxRetries: 3 });
    const body = JSON.stringify({ title: "test" });

    const resPromise = retrying("https://api.example.com/data", {
      method: "POST",
      body,
      headers: { "content-type": "application/json" },
    });
    await vi.advanceTimersByTimeAsync(1500);

    const res = await resPromise;
    expect(res.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });
});

describe("createRetryFetch - ReadableStream body", () => {
  it("rejects requests with ReadableStream body", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ error: "fail" }, 503));
    const retrying = createRetryFetch(fetchFn, { baseDelay: 1, maxRetries: 1 });
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("test"));
        controller.close();
      },
    });

    await expect(
      retrying("https://api.example.com/data", {
        method: "POST",
        body: stream,
      }),
    ).rejects.toThrow("Cannot retry a request with a ReadableStream body");

    // The fetch mock was called once on attempt=0; attempt=1 fails before fetch
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

// default config

describe("createRetryFetch - default configuration", () => {
  beforeEach(() => {
    setupDeterministicTimers();
  });

  afterEach(() => {
    cleanupTimers();
  });

  it("uses default maxRetries=3, baseDelay=1000, maxDelay=30000", async () => {
    const fetchFn = sequentialFetch(503, 503, 503, 200);
    const retrying = createRetryFetch(fetchFn);

    const resPromise = retrying("https://api.example.com/data");
    // attempt 0: delay = jitter(min(30000,1000*2^0)) = jitter(1000) = floor(0.5*1000) = 500
    // attempt 1: delay = jitter(min(30000,1000*2^1)) = jitter(2000) = floor(0.5*2000) = 1000
    // attempt 2: delay = jitter(min(30000,1000*2^2)) = jitter(4000) = floor(0.5*4000) = 2000
    // Total: 3500
    await vi.advanceTimersByTimeAsync(3500);

    const res = await resPromise;
    expect(res.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(4); // initial + 3 retries
  });

  it("caps delay at maxDelay", async () => {
    const fetchFn = sequentialFetch(503, 200);
    const retrying = createRetryFetch(fetchFn, {
      baseDelay: 50000,
      maxDelay: 100,
      maxRetries: 2,
    });

    const resPromise = retrying("https://api.example.com/data");
    // delay = jitter(min(100, 50000)) = jitter(100) = floor(0.5*100) = 50
    await vi.advanceTimersByTimeAsync(50);

    const res = await resPromise;
    expect(res.status).toBe(200);
  });
});

// edge cases

describe("createRetryFetch - edge cases", () => {
  it("works without any config", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ ok: true }));
    const retrying = createRetryFetch(fetchFn);

    const res = await retrying("https://api.example.com/data");

    expect(res.status).toBe(200);
  });

  it("works with an empty config object", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ ok: true }));
    const retrying = createRetryFetch(fetchFn, {});

    const res = await retrying("https://api.example.com/data");

    expect(res.status).toBe(200);
  });

  it("throws when maxRetries is 0 and response is retryable", async () => {
    const fetchFn = sequentialFetch(503);
    const retrying = createRetryFetch(fetchFn, { maxRetries: 0 });

    const res = await retrying("https://api.example.com/data");

    // attempt === maxRetries (0), so the response is returned as-is
    expect(res.status).toBe(503);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe("createRetryFetch - retry URL passthrough", () => {
  beforeEach(() => {
    setupDeterministicTimers();
  });

  afterEach(() => {
    cleanupTimers();
  });

  it("calls fetchImpl with correct URL each retry", async () => {
    const fetchFn = sequentialFetch(503, 200);
    const retrying = createRetryFetch(fetchFn, { maxRetries: 2 });

    const resPromise = retrying("https://api.example.com/items?page=1");
    await vi.advanceTimersByTimeAsync(500);

    await resPromise;

    expect(fetchFn.mock.calls[0][0]).toBe(
      "https://api.example.com/items?page=1",
    );
    expect(fetchFn.mock.calls[1][0]).toBe(
      "https://api.example.com/items?page=1",
    );
  });
});

describe("createRetryFetch - no sleep on success", () => {
  it("does not sleep when no retry is needed", async () => {
    const sleepSpy = vi.spyOn(globalThis, "setTimeout");
    const fetchFn = vi.fn(async () => jsonResponse({ ok: true }));
    const retrying = createRetryFetch(fetchFn, { maxRetries: 3 });

    await retrying("https://api.example.com/data");

    // setTimeout should not have been called because no retry happened
    expect(sleepSpy).not.toHaveBeenCalled();
    sleepSpy.mockRestore();
  });
});
