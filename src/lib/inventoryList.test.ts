import { describe, expect, it } from "vitest";
import type { InventoryList, InventoryRow } from "@/lib/contracts/catalogue";
import { replaceRow, restocked } from "./inventoryList";
import { stockFigures } from "./stock";

function row(sku: string, onHand: number, sold: number): InventoryRow {
  return {
    variantId: 1,
    sku,
    productId: 1,
    productName: "Test bowl",
    collection: "test",
    optionLabel: "Blue",
    imageSlot: "bowl",
    priceCents: 1000,
    sold14Days: sold,
    ...stockFigures(onHand, sold),
  };
}

function list(...rows: InventoryRow[]): InventoryList {
  return {
    rows,
    collections: [],
    counts: {
      all: rows.length,
      low: rows.filter((r) => r.state === "low").length,
      out: rows.filter((r) => r.state === "out").length,
    },
  };
}

describe("stockFigures", () => {
  it("rounds cover to one decimal and leaves unsold stock without a figure", () => {
    expect(stockFigures(10, 14)).toEqual({ onHand: 10, daysOfCover: 10, state: "in_stock" });
    expect(stockFigures(4, 14)).toEqual({ onHand: 4, daysOfCover: 4, state: "low" });
    expect(stockFigures(1, 3).daysOfCover).toBe(4.7);
    expect(stockFigures(5, 0)).toEqual({ onHand: 5, daysOfCover: null, state: "in_stock" });
    expect(stockFigures(-2, 14)).toEqual({ onHand: -2, daysOfCover: 0, state: "out" });
  });
});

describe("restocked", () => {
  it("moves a variant out of low stock once the cover is back", () => {
    const next = restocked(row("AAA-BBB-01", 4, 14), 10);
    expect(next).toMatchObject({ onHand: 14, daysOfCover: 14, state: "in_stock" });
  });

  it("counts backorders first: 5 units against 8 owed is still out", () => {
    expect(restocked(row("AAA-BBB-01", -8, 14), 5)).toMatchObject({ onHand: -3, state: "out" });
  });
});

describe("replaceRow", () => {
  it("moves the state counts and keeps the row in its place", () => {
    const low = row("AAA-BBB-01", 4, 14);
    const out = row("AAA-BBB-02", 0, 14);
    const fine = row("AAA-BBB-03", 100, 14);
    const before = list(out, low, fine);

    const next = replaceRow(before, restocked(low, 50));
    expect(next.counts).toEqual({ all: 3, low: 0, out: 1 });
    expect(next.rows.map((r) => r.sku)).toEqual(["AAA-BBB-02", "AAA-BBB-01", "AAA-BBB-03"]);

    const fromOut = replaceRow(next, restocked(out, 1));
    expect(fromOut.counts).toEqual({ all: 3, low: 1, out: 0 });
  });

  it("leaves a list that does not hold the row alone", () => {
    const before = list(row("AAA-BBB-01", 4, 14));
    expect(replaceRow(before, row("AAA-BBB-09", 4, 14))).toBe(before);
  });
});
