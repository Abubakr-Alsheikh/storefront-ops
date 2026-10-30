import { describe, expect, it } from "vitest";
import { areaPath, labelIndexes, linePath, nearestIndex, niceTicks } from "./chart";

describe("chart geometry", () => {
  it("picks round ticks that cover the maximum", () => {
    expect(niceTicks(22_300)).toEqual([0, 10_000, 20_000, 30_000]);
    expect(niceTicks(100)).toEqual([0, 25, 50, 75, 100]);
    expect(niceTicks(0)).toEqual([0, 1]);
    for (const max of [3, 999, 1234, 987_654]) {
      const ticks = niceTicks(max);
      expect(ticks.at(-1)).toBeGreaterThanOrEqual(max);
      expect(ticks.length).toBeLessThanOrEqual(7);
    }
  });

  it("draws lines over a 100-unit box and breaks at gaps", () => {
    expect(linePath([0, 50, 100], 100)).toBe("M0.00 100.00L50.00 50.00L100.00 0.00");
    expect(linePath([10, null, 10], 10)).toBe("M0.00 0.00M100.00 0.00");
    expect(areaPath([0, 100], 100)).toBe("M0.00 100.00L100.00 0.00L100 100L0 100Z");
    expect(areaPath([5], 10)).toBe("");
  });

  it("finds the nearest point and chooses labels", () => {
    expect(nearestIndex(0.49, 3)).toBe(1);
    expect(nearestIndex(-1, 3)).toBe(0);
    expect(nearestIndex(2, 3)).toBe(2);
    expect(nearestIndex(0.5, 1)).toBe(0);
    expect(labelIndexes(24, 6)).toEqual([0, 4, 8, 12, 16, 20]);
    expect(labelIndexes(3, 6)).toEqual([0, 1, 2]);
  });
});
