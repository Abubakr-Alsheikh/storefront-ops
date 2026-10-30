/** Geometry for the hand-drawn charts: no DOM, so it can be tested. */

/** Round axis ticks from 0 to just above `max`: 22,300 → [0, 5000, 10000, 15000, 20000, 25000]. */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const rough = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? 10 * magnitude;
  const ticks = [];
  for (let value = 0; value < max + step; value += step) ticks.push(value);
  return ticks;
}

/** An SVG path over a 0-100 box. `null` values leave a gap in the line. */
export function linePath(values: readonly (number | null)[], top: number): string {
  const last = Math.max(1, values.length - 1);
  let path = "";
  let drawing = false;
  values.forEach((value, i) => {
    if (value === null) {
      drawing = false;
      return;
    }
    const x = ((i / last) * 100).toFixed(2);
    const y = (100 - (value / top) * 100).toFixed(2);
    path += `${drawing ? "L" : "M"}${x} ${y}`;
    drawing = true;
  });
  return path;
}

/** Closes a line of complete values down to the baseline, for the area fill. */
export function areaPath(values: readonly number[], top: number): string {
  if (values.length < 2) return "";
  return `${linePath(values, top)}L100 100L0 100Z`;
}

/** Which of `count` evenly spaced points is nearest to a 0-1 position. */
export function nearestIndex(position: number, count: number): number {
  if (count <= 1) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(position * (count - 1))));
}

/** Evenly chosen indexes for at most `max` axis labels, always including the first. */
export function labelIndexes(count: number, max: number): number[] {
  const step = Math.max(1, Math.ceil(count / max));
  const indexes = [];
  for (let i = 0; i < count; i += step) indexes.push(i);
  return indexes;
}
