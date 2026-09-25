import { describe, expectTypeOf, it } from "vitest";
import type { Entitlements } from "../src/index.js";

describe("Entitlements", () => {
  it("declares the licence fields the entitlements route returns", () => {
    expectTypeOf<Entitlements>().toHaveProperty("license_source");
    expectTypeOf<Entitlements["license_source"]>().toEqualTypeOf<
      "token" | "key" | "stored_key" | undefined
    >();
    expectTypeOf<Entitlements["expires_at"]>().toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf<Entitlements["license_error"]>().toEqualTypeOf<
      string | undefined
    >();
  });
});
