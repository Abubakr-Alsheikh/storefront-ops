import { describe, expect, it } from "vitest";
import { COLLECTIONS, IMAGE_SLOTS, PRODUCTS, VARIANTS, productById, variantById } from "./catalogue";
import { COUNTRIES, COUNTRY_CODES } from "./countries";
import { NAMES, emailSlug } from "./names";

describe("catalogue", () => {
  it("has about 160 products and 420 SKUs across 12 collections", () => {
    expect(COLLECTIONS).toHaveLength(12);
    expect(PRODUCTS.length).toBeGreaterThanOrEqual(150);
    expect(PRODUCTS.length).toBeLessThanOrEqual(170);
    expect(VARIANTS.length).toBeGreaterThanOrEqual(400);
    expect(VARIANTS.length).toBeLessThanOrEqual(440);
  });

  it("keeps slugs, SKUs and ids unique", () => {
    expect(new Set(PRODUCTS.map((p) => p.slug)).size).toBe(PRODUCTS.length);
    expect(new Set(VARIANTS.map((v) => v.sku)).size).toBe(VARIANTS.length);
    PRODUCTS.forEach((p, i) => expect(p.id).toBe(i + 1));
    VARIANTS.forEach((v, i) => expect(v.id).toBe(i + 1));
  });

  it("prices in whole euros and links every variant to a product", () => {
    for (const v of VARIANTS) {
      expect(Number.isInteger(v.priceCents)).toBe(true);
      expect(v.priceCents % 100).toBe(0);
      expect(v.priceCents).toBeGreaterThan(0);
      expect(v.weightGrams).toBeGreaterThan(0);
      expect(v.leadTimeDays).toBeGreaterThan(0);
      expect(v.popularity).toBeGreaterThan(0);
      expect(v.sku).toMatch(/^[A-Z]{3}-[A-Z]{3}-\d{2}$/);
      expect(productById(v.productId)).toBeDefined();
    }
    expect(variantById(1)).toBe(VARIANTS[0]);
  });

  it("gives every product at least one variant and a known photo slot", () => {
    const withVariants = new Set(VARIANTS.map((v) => v.productId));
    for (const p of PRODUCTS) {
      expect(withVariants.has(p.id)).toBe(true);
      expect(IMAGE_SLOTS).toContain(p.imageSlot);
    }
    // Every photo slot is used by some product.
    expect(new Set(PRODUCTS.map((p) => p.imageSlot)).size).toBe(IMAGE_SLOTS.length);
  });

  it("names products the way a shop would", () => {
    expect(productById(1)?.name).toBe("Enseada mug");
    const tablecloth = PRODUCTS.find((p) => p.slug === "alfama-tablecloth");
    const sizes = VARIANTS.filter((v) => v.productId === tablecloth?.id).map((v) => v.optionLabel);
    expect(sizes).toEqual(["150 × 220 cm", "150 × 300 cm"]);
    const glass = PRODUCTS.find((p) => p.slug === "enseada-tumblers");
    const tints = VARIANTS.filter((v) => v.productId === glass?.id).map((v) => v.optionLabel);
    expect(tints).toEqual(["Clear", "Sea glass"]);
  });
});

describe("countries and names", () => {
  it("covers twelve countries with shares summing to 100", () => {
    expect(COUNTRY_CODES).toHaveLength(12);
    expect(COUNTRY_CODES.reduce((sum, c) => sum + COUNTRIES[c].share, 0)).toBe(100);
    for (const code of COUNTRY_CODES) {
      expect(COUNTRIES[code].cities.length).toBeGreaterThanOrEqual(4);
      expect(NAMES[code].first.length).toBeGreaterThanOrEqual(12);
      expect(NAMES[code].last.length).toBeGreaterThanOrEqual(12);
    }
  });

  it("turns any name into plain ASCII for emails", () => {
    expect(emailSlug("Søren")).toBe("soren");
    expect(emailSlug("Łukasz")).toBe("lukasz");
    expect(emailSlug("Schröder")).toBe("schroder");
    expect(emailSlug("O'Brien")).toBe("obrien");
    expect(emailSlug("van den Berg")).toBe("vandenberg");
    expect(emailSlug("Gonçalves")).toBe("goncalves");
    expect(emailSlug("Weiß")).toBe("weiss");
    for (const code of COUNTRY_CODES) {
      for (const name of [...NAMES[code].first, ...NAMES[code].last]) {
        expect(emailSlug(name)).toMatch(/^[a-z]+$/);
      }
    }
  });
});
