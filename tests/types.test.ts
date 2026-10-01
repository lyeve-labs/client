import { describe, expectTypeOf, it } from "vitest";
import type { Entitlements } from "../src/index.js";

describe("Entitlements", () => {
  it("declares the license fields the entitlements route returns", () => {
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

  it("declares the tenant, capacity and module fields", () => {
    expectTypeOf<Entitlements["plan_label"]>().toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf<Entitlements["grace_ends_at"]>().toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf<Entitlements["withheld"]>().toEqualTypeOf<
      string[] | undefined
    >();
    expectTypeOf<Entitlements["caps"]>().toEqualTypeOf<
      Record<string, number> | undefined
    >();
    expectTypeOf<Entitlements["license_module"]>().toEqualTypeOf<
      boolean | undefined
    >();
  });

  it("accepts the body an engine sends today", () => {
    const body: Entitlements = {
      plan: "free",
      state: "free",
      features: ["search"],
      withheld: [],
      tenant_quota: 0,
      caps: { "rbac.roles": 3 },
      license_module: false,
    };
    expectTypeOf(body).toMatchTypeOf<Entitlements>();
  });
});
