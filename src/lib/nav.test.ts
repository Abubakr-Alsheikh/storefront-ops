import { describe, expect, it } from "vitest";
import { isActivePath, titleForPath } from "./nav";

describe("navigation", () => {
  it("matches a section and its children, and the overview exactly", () => {
    expect(isActivePath("/", "/")).toBe(true);
    expect(isActivePath("/", "/orders")).toBe(false);
    expect(isActivePath("/orders", "/orders/100123")).toBe(true);
    expect(isActivePath("/orders", "/ordersx")).toBe(false);
  });

  it("titles deep links by their section", () => {
    expect(titleForPath("/")).toBe("Overview");
    expect(titleForPath("/customers/42")).toBe("Customers");
    expect(titleForPath("/nope")).toBe("");
  });
});
