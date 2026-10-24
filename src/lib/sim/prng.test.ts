import { describe, expect, it } from "vitest";
import {
  hash32,
  mulberry32,
  poisson,
  randInt,
  rngFor,
  weightedPick,
  weightedPicker,
} from "./prng";

function meanAndVariance(values: number[]) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return { mean, variance };
}

describe("hash32", () => {
  it("is stable across runs", () => {
    expect(hash32("tidewell", 1)).toBe(hash32("tidewell", 1));
    expect(hash32("tidewell", 1)).toMatchInlineSnapshot(`117629048`);
  });

  it("separates parts, so moving characters between them changes the hash", () => {
    expect(hash32("ab", "c")).not.toBe(hash32("a", "bc"));
    expect(hash32(1, 23)).not.toBe(hash32(12, 3));
    expect(hash32("1")).not.toBe(hash32(1));
  });

  it("returns an unsigned 32-bit integer", () => {
    for (let i = 0; i < 1000; i++) {
      const h = hash32("x", i);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(2 ** 32);
    }
  });
});

describe("mulberry32", () => {
  it("gives the same sequence for the same seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 5 }, () => a());
    const seqB = Array.from({ length: 5 }, () => b());
    expect(seqA).toEqual(seqB);
    expect(seqA[0]).toMatchInlineSnapshot(`0.6011037519201636`);
  });

  it("stays in [0, 1) with a uniform mean", () => {
    const rng = mulberry32(7);
    const values = Array.from({ length: 50_000 }, () => rng());
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
    const { mean, variance } = meanAndVariance(values);
    expect(mean).toBeCloseTo(0.5, 2);
    expect(variance).toBeCloseTo(1 / 12, 2);
  });

  it("randInt covers both ends of the range", () => {
    const rng = rngFor("randInt");
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(randInt(rng, 1, 6));
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe("poisson", () => {
  it.each([0.5, 4, 60, 250])("has mean and variance near λ = %d", (lambda) => {
    const rng = rngFor("poisson", lambda);
    const draws = Array.from({ length: 20_000 }, () => poisson(rng, lambda));
    const { mean, variance } = meanAndVariance(draws);
    expect(Math.abs(mean - lambda) / lambda).toBeLessThan(0.03);
    expect(Math.abs(variance - lambda) / lambda).toBeLessThan(0.06);
    expect(draws.every((d) => Number.isInteger(d) && d >= 0)).toBe(true);
  });

  it("returns 0 for a zero or invalid mean", () => {
    const rng = rngFor("poisson-zero");
    expect(poisson(rng, 0)).toBe(0);
    expect(poisson(rng, -1)).toBe(0);
    expect(poisson(rng, Number.NaN)).toBe(0);
  });
});

describe("weightedPicker", () => {
  it("picks in proportion to the weights and never picks weight 0", () => {
    const pick = weightedPicker(["a", "b", "c", "d"], [1, 3, 6, 0]);
    const rng = rngFor("weights");
    const counts: Record<string, number> = { a: 0, b: 0, c: 0, d: 0 };
    const n = 60_000;
    for (let i = 0; i < n; i++) counts[pick(rng)]++;
    expect(counts.a / n).toBeCloseTo(0.1, 1);
    expect(counts.b / n).toBeCloseTo(0.3, 1);
    expect(counts.c / n).toBeCloseTo(0.6, 1);
    expect(counts.d).toBe(0);
  });

  it("rejects mismatched or empty weights", () => {
    expect(() => weightedPicker([], [])).toThrow();
    expect(() => weightedPicker(["a"], [1, 2])).toThrow();
    expect(() => weightedPicker(["a"], [0])).toThrow();
    expect(() => weightedPicker(["a"], [-1])).toThrow();
  });

  it("weightedPick matches a picker built from the same weights", () => {
    const items = [1, 2, 3];
    const weights = [2, 1, 1];
    expect(weightedPick(rngFor("same"), items, weights)).toBe(
      weightedPicker(items, weights)(rngFor("same")),
    );
  });
});
