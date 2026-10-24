/**
 * Seeded randomness for the simulator. Everything here is pure: the same
 * inputs give the same numbers on any machine, which is what lets the seed,
 * the live feed and the nightly reset agree without talking to each other.
 */

/** A source of uniform numbers in [0, 1). */
export type Rng = () => number;

/**
 * 32-bit hash of any mix of strings and numbers (FNV-1a over the parts,
 * finished with a murmur3 avalanche so nearby inputs land far apart).
 */
export function hash32(...parts: ReadonlyArray<string | number>): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    const text = typeof part === "number" ? `#${part}` : part;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    // Separator, so ("ab", "c") and ("a", "bc") differ.
    h ^= 0xff;
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Mulberry32: a small, fast, well-distributed 32-bit generator. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A generator seeded from a hash of the parts. */
export function rngFor(...parts: ReadonlyArray<string | number>): Rng {
  return mulberry32(hash32(...parts));
}

/** Integer in [min, max], both inclusive. */
export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Number in [min, max). */
export function randBetween(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

/** Largest mean drawn in one Knuth step; exp(-30) is far from underflow. */
const KNUTH_CHUNK = 30;

/**
 * Poisson draw with mean `lambda`. Knuth's product method, split into chunks
 * of at most 30 (a sum of Poisson draws is Poisson with the summed mean), so
 * large means stay exact and never underflow. Cost grows with lambda, which
 * stays in the hundreds here.
 */
export function poisson(rng: Rng, lambda: number): number {
  if (!(lambda > 0)) return 0;
  let count = 0;
  let remaining = lambda;
  while (remaining > 0) {
    const step = Math.min(remaining, KNUTH_CHUNK);
    remaining -= step;
    const limit = Math.exp(-step);
    let product = rng();
    while (product > limit) {
      count++;
      product *= rng();
    }
  }
  return count;
}

/**
 * Builds a picker over fixed weights: O(n) once, then O(log n) per pick
 * through a binary search on the cumulative table.
 */
export function weightedPicker<T>(
  items: readonly T[],
  weights: readonly number[],
): (rng: Rng) => T {
  if (items.length === 0 || items.length !== weights.length) {
    throw new Error("weightedPicker needs one positive weight per item");
  }
  const cumulative = new Float64Array(weights.length);
  let total = 0;
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i];
    if (!(w >= 0)) throw new Error(`Invalid weight at ${i}: ${w}`);
    total += w;
    cumulative[i] = total;
  }
  if (!(total > 0)) throw new Error("weightedPicker needs a positive total");

  return (rng) => {
    const target = rng() * total;
    let lo = 0;
    let hi = cumulative.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (cumulative[mid] > target) hi = mid;
      else lo = mid + 1;
    }
    return items[lo];
  };
}

/** One-off weighted pick. Build a `weightedPicker` for anything in a loop. */
export function weightedPick<T>(
  rng: Rng,
  items: readonly T[],
  weights: readonly number[],
): T {
  return weightedPicker(items, weights)(rng);
}
