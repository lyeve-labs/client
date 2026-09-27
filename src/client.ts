/**
 * Framework-agnostic HTTP client for the LyEve CMS API.
 *
 * The `createClient` factory accepts any `fetch`-compatible function
 * (globalThis.fetch, SvelteKit's event.fetch, a Node.js polyfill) and
 * returns a typed client with get/post/put/delete methods that handle
 * JSON serialization, error mapping, and timeout.
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /**
     * The decoded response body, when the server sent JSON, and undefined
     * otherwise. `message` is its `error` key, which is all this class used
     * to keep.
     *
     * Several of the engine's refusals carry more than a code. A 402 for a
     * capacity ceiling sends `cap`, `limit` and `current` so a console can
     * say "3 of 3" without holding the number itself, and a 402 from the
     * flow plugin sends the node ids at fault so an editor can mark them.
     * None of that survived the throw, so every caller had to re-fetch or
     * guess, and the one console that needed the numbers rendered them from
     * a second source instead.
     *
     * Typed `unknown` on purpose. It is whatever the server sent, and a
     * caller narrows it.
     */
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type HttpClient = ReturnType<typeof createClient>;

export function createClient(
  fetchFn: typeof fetch,
  defaultHeaders: Record<string, string> = {},
) {
  async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetchFn(url, {
      ...init,
      // Default 15 s timeout so a slow/unresponsive backend can't hang
      // the caller indefinitely. Callers may override by passing their
      // own AbortSignal.
      signal: init?.signal ?? AbortSignal.timeout(15_000),
      headers: {
        "Content-Type": "application/json",
        ...defaultHeaders,
        ...(init?.headers instanceof Headers
          ? Object.fromEntries(init.headers.entries())
          : Array.isArray(init?.headers)
            ? Object.fromEntries(init.headers)
            : init?.headers),
      },
    });

    if (!res.ok) {
      const text = await res.text();
      let message = text;
      let body: unknown;
      try {
        const json = JSON.parse(text) as { error?: string };
        body = json;
        message = json.error ?? text;
      } catch {
        // Not JSON. The raw text is the message and there is no body to
        // narrow, which is the case a caller reading `body` has to handle.
      }
      throw new ApiError(res.status, message, body);
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  return {
    get: <T>(url: string, init?: RequestInit) =>
      request<T>(url, { ...init, method: "GET" }),
    post: <T>(url: string, body: unknown, init?: RequestInit) =>
      request<T>(url, { ...init, method: "POST", body: JSON.stringify(body) }),
    put: <T>(url: string, body: unknown, init?: RequestInit) =>
      request<T>(url, { ...init, method: "PUT", body: JSON.stringify(body) }),
    patch: <T>(url: string, body: unknown, init?: RequestInit) =>
      request<T>(url, { ...init, method: "PATCH", body: JSON.stringify(body) }),
    delete: <T>(url: string, init?: RequestInit) =>
      request<T>(url, { ...init, method: "DELETE" }),
  };
}
