import { describe, it, expect, vi } from "vitest";
import { createClient, ApiError } from "../src/client.js";

// helpers

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A typed fetch stub that returns a fixed Response and records its calls. */
function stubFetch(make: () => Response) {
  return vi.fn(async (_url: string, _init: RequestInit): Promise<Response> =>
    make(),
  );
}

// request building

describe("createClient - request building", () => {
  it("GET uses method GET and sends no body", async () => {
    const fetchFn = stubFetch(() => jsonResponse({ ok: true }));
    const client = createClient(fetchFn as unknown as typeof fetch);

    const out = await client.get<{ ok: boolean }>("/x");

    expect(out).toEqual({ ok: true });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("/x");
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
  });

  it("POST serializes the body to JSON", async () => {
    const fetchFn = stubFetch(() => jsonResponse({}));
    const client = createClient(fetchFn as unknown as typeof fetch);

    await client.post("/x", { a: 1, b: "two" });

    const init = fetchFn.mock.calls[0][1];
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ a: 1, b: "two" }));
  });

  it("PUT serializes the body to JSON", async () => {
    const fetchFn = stubFetch(() => jsonResponse({}));
    const client = createClient(fetchFn as unknown as typeof fetch);

    await client.put("/x", { updated: true });

    const init = fetchFn.mock.calls[0][1];
    expect(init.method).toBe("PUT");
    expect(init.body).toBe(JSON.stringify({ updated: true }));
  });

  it("DELETE uses method DELETE and sends no body", async () => {
    const fetchFn = stubFetch(() => new Response(null, { status: 204 }));
    const client = createClient(fetchFn as unknown as typeof fetch);

    await client.delete("/x");

    const init = fetchFn.mock.calls[0][1];
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
  });

  it("passes the URL through unchanged", async () => {
    const fetchFn = stubFetch(() => jsonResponse({}));
    const client = createClient(fetchFn as unknown as typeof fetch);

    await client.get("/api/admin/things?limit=10&offset=0");

    expect(fetchFn.mock.calls[0][0]).toBe(
      "/api/admin/things?limit=10&offset=0",
    );
  });
});

// headers

describe("createClient - headers", () => {
  it("sets Content-Type application/json by default", async () => {
    const fetchFn = stubFetch(() => jsonResponse({}));
    const client = createClient(fetchFn as unknown as typeof fetch);

    await client.get("/x");

    const headers = fetchFn.mock.calls[0][1].headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("merges default headers and per-call headers", async () => {
    const fetchFn = stubFetch(() => jsonResponse({}));
    const client = createClient(fetchFn as unknown as typeof fetch, {
      Authorization: "Bearer tok",
    });

    await client.get("/x", { headers: { "X-Extra": "1" } });

    const headers = fetchFn.mock.calls[0][1].headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["Authorization"]).toBe("Bearer tok");
    expect(headers["X-Extra"]).toBe("1");
  });

  it("per-call headers override default headers", async () => {
    const fetchFn = stubFetch(() => jsonResponse({}));
    const client = createClient(fetchFn as unknown as typeof fetch, {
      "X-Env": "default",
    });

    await client.get("/x", { headers: { "X-Env": "override" } });

    const headers = fetchFn.mock.calls[0][1].headers as Record<string, string>;
    expect(headers["X-Env"]).toBe("override");
  });
});

// abort signal

describe("createClient - abort signal", () => {
  it("applies a default AbortSignal when the caller supplies none", async () => {
    const fetchFn = stubFetch(() => jsonResponse({}));
    const client = createClient(fetchFn as unknown as typeof fetch);

    await client.get("/x");

    expect(fetchFn.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it("preserves a caller-supplied AbortSignal", async () => {
    const fetchFn = stubFetch(() => jsonResponse({}));
    const client = createClient(fetchFn as unknown as typeof fetch);
    const ctrl = new AbortController();

    await client.get("/x", { signal: ctrl.signal });

    expect(fetchFn.mock.calls[0][1].signal).toBe(ctrl.signal);
  });
});

// response mapping

describe("createClient - response mapping", () => {
  it("parses and returns a JSON body on success", async () => {
    const fetchFn = stubFetch(() => jsonResponse({ id: "1", name: "x" }));
    const client = createClient(fetchFn as unknown as typeof fetch);

    const out = await client.get<{ id: string; name: string }>("/x");

    expect(out).toEqual({ id: "1", name: "x" });
  });

  it("returns undefined for a 204 No Content response", async () => {
    const fetchFn = stubFetch(() => new Response(null, { status: 204 }));
    const client = createClient(fetchFn as unknown as typeof fetch);

    const out = await client.delete<void>("/x");

    expect(out).toBeUndefined();
  });
});

// error mapping (ApiError)

describe("createClient - ApiError mapping", () => {
  it("throws ApiError carrying the parsed { error } message on a non-ok JSON body", async () => {
    const fetchFn = stubFetch(() => jsonResponse({ error: "boom" }, 400));
    const client = createClient(fetchFn as unknown as typeof fetch);

    const err = await client.get("/x").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    if (err instanceof ApiError) {
      expect(err.status).toBe(400);
      expect(err.message).toBe("boom");
      expect(err.name).toBe("ApiError");
    }
  });

  it("keeps the whole decoded body, so a refusal that carries numbers survives the throw", async () => {
    // The engine's capacity refusal. The two numbers are what lets a console
    // say "3 of 3" without holding the ceiling itself, and they used to be
    // dropped here, leaving the caller with the code alone.
    const fetchFn = stubFetch(() =>
      jsonResponse(
        {
          error: "cap_exceeded",
          cap: "rbac.roles",
          limit: 3,
          current: 3,
          upgrade_url: "",
        },
        402,
      ),
    );
    const client = createClient(fetchFn as unknown as typeof fetch);

    const err = await client
      .post("/api/admin/permissions", {})
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    if (err instanceof ApiError) {
      expect(err.status).toBe(402);
      expect(err.message).toBe("cap_exceeded");
      expect(err.body).toEqual({
        error: "cap_exceeded",
        cap: "rbac.roles",
        limit: 3,
        current: 3,
        upgrade_url: "",
      });
    }
  });

  it("leaves body undefined when the error was not JSON, so a caller can tell nothing was sent", async () => {
    const fetchFn = stubFetch(
      () => new Response("gateway down", { status: 502 }),
    );
    const client = createClient(fetchFn as unknown as typeof fetch);

    const err = await client.get("/x").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    if (err instanceof ApiError) {
      expect(err.body).toBeUndefined();
    }
  });

  it("falls back to the raw text when the error body is not JSON", async () => {
    const fetchFn = stubFetch(
      () => new Response("gateway down", { status: 502 }),
    );
    const client = createClient(fetchFn as unknown as typeof fetch);

    const err = await client.get("/x").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    if (err instanceof ApiError) {
      expect(err.status).toBe(502);
      expect(err.message).toBe("gateway down");
    }
  });

  it("falls back to the raw text when JSON lacks an error field", async () => {
    const fetchFn = stubFetch(() => jsonResponse({ detail: "nope" }, 422));
    const client = createClient(fetchFn as unknown as typeof fetch);

    const err = await client.get("/x").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    if (err instanceof ApiError) {
      expect(err.status).toBe(422);
      expect(err.message).toBe(JSON.stringify({ detail: "nope" }));
    }
  });

  it("ApiError is an Error subclass", () => {
    const err = new ApiError(404, "missing");
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(404);
    expect(err.message).toBe("missing");
    expect(err.name).toBe("ApiError");
  });
});
