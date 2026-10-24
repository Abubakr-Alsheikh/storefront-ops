import { describe, expect, it } from "vitest";
import { daysOfCover, stockState, velocityPerDay } from "./stock";

describe("stock maths", () => {
  it("averages sales over 14 days", () => {
    expect(velocityPerDay(28)).toBe(2);
    expect(velocityPerDay(0)).toBe(0);
  });

  it("measures cover in days, with none for an item that does not sell", () => {
    expect(daysOfCover(20, 2)).toBe(10);
    expect(daysOfCover(20, 0)).toBeNull();
    expect(daysOfCover(0, 2)).toBe(0);
    expect(daysOfCover(-3, 2)).toBe(0);
  });

  it("flags out, low and in stock", () => {
    expect(stockState(0, 2)).toBe("out");
    expect(stockState(-4, 2)).toBe("out");
    expect(stockState(13, 2)).toBe("low");
    expect(stockState(14, 2)).toBe("in_stock");
    expect(stockState(3, 0)).toBe("in_stock");
  });
});
