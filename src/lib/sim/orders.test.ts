import { beforeAll, describe, expect, it } from "vitest";
import { PRODUCTS, VARIANTS } from "@/lib/data/catalogue";
import { COUNTRIES, SHIPPING_ZONES } from "@/lib/data/countries";
import { BLOCKED_NAMES } from "@/lib/data/names";
import { dayNumberFromKey, startOfDayNumber, zonedParts } from "@/lib/tz";
import { HOUR_MS, SIM_VERSION } from "./config";
import { firstOrderHour } from "./customers";
import { ordersInHour, RETURNING_SHARE, simulateOrders, type SimOrder } from "./orders";
import { hash32 } from "./prng";
import { isSaleDay } from "./rate";

const DAY_MS = 86_400_000;
const utc = (iso: string) => Date.parse(iso);

const END = utc("2026-10-24T12:00:00Z");
const START = END - 90 * DAY_MS;

let ninetyDays: SimOrder[] = [];
let ninetyDaysMs = 0;

beforeAll(() => {
  const t = performance.now();
  ninetyDays = simulateOrders(START, END);
  ninetyDaysMs = performance.now() - t;
});

describe("determinism", () => {
  it("gives byte-identical output for the same window", () => {
    const a = JSON.stringify(simulateOrders(utc("2026-10-20T00:00:00Z"), utc("2026-10-20T06:00:00Z")));
    const b = JSON.stringify(simulateOrders(utc("2026-10-20T00:00:00Z"), utc("2026-10-20T06:00:00Z")));
    expect(a).toBe(b);
  });

  it("matches the recorded history (a change here needs a SIM_VERSION bump)", () => {
    const day = simulateOrders(utc("2026-10-19T23:00:00Z"), utc("2026-10-20T23:00:00Z"));
    expect(SIM_VERSION).toBe(1);
    expect({ orders: day.length, hash: hash32(JSON.stringify(day)) }).toMatchInlineSnapshot(`
      {
        "hash": 650497535,
        "orders": 1462,
      }
    `);
  });
});

describe("window seams", () => {
  const a = utc("2026-10-10T10:17:00Z");
  const c = utc("2026-10-11T03:41:00Z");
  const whole = simulateOrders(a, c);
  const keys = (orders: SimOrder[]) => orders.map((o) => o.simKey);

  it.each([
    ["mid-hour", utc("2026-10-10T19:33:21.500Z")],
    ["on an hour boundary", utc("2026-10-10T21:00:00Z")],
  ])("splitting %s gives the same orders, with no duplicates or gaps", (_, b) => {
    const joined = [...simulateOrders(a, b), ...simulateOrders(b, c)];
    expect(JSON.stringify(joined)).toBe(JSON.stringify(whole));
  });

  it("includes an order placed exactly at the seam in the first window only", () => {
    const seam = whole[Math.floor(whole.length / 2)].placedAt;
    const left = simulateOrders(a, seam);
    const right = simulateOrders(seam, c);
    expect(left.at(-1)?.placedAt).toBe(seam);
    expect(right[0].placedAt).toBeGreaterThan(seam);
    expect([...keys(left), ...keys(right)]).toEqual(keys(whole));
  });

  it("returns nothing for an empty or reversed window", () => {
    expect(simulateOrders(a, a)).toEqual([]);
    expect(simulateOrders(c, a)).toEqual([]);
  });

  it("sorts by placedAt with unique keys", () => {
    for (let i = 1; i < whole.length; i++) {
      expect(whole[i].placedAt).toBeGreaterThanOrEqual(whole[i - 1].placedAt);
    }
    expect(new Set(keys(whole)).size).toBe(whole.length);
  });
});

describe("volume", () => {
  it("simulates 90 days in under 3 seconds", () => {
    expect(ninetyDays.length).toBeGreaterThan(120_000);
    expect(ninetyDaysMs).toBeLessThan(3000);
  });

  it("keeps every whole non-sale day between 1,200 and 1,600 orders over 90 days", () => {
    const perDay = new Map<number, number>();
    for (const o of ninetyDays) {
      const d = zonedParts(o.placedAt).dayNumber;
      perDay.set(d, (perDay.get(d) ?? 0) + 1);
    }
    const days = [...perDay.keys()].sort((x, y) => x - y).slice(1, -1); // drop partial ends
    expect(days.length).toBeGreaterThanOrEqual(88);
    const normal = days.filter((d) => !isSaleDay(d));
    expect(normal.length).toBeGreaterThan(70);
    for (const d of normal) {
      expect(perDay.get(d)).toBeGreaterThanOrEqual(1200);
      expect(perDay.get(d)).toBeLessThanOrEqual(1600);
    }
    for (const d of days.filter(isSaleDay)) {
      expect(perDay.get(d)).toBeGreaterThan(2400);
    }
  });

  it("stays in the band for a whole year of hourly counts", () => {
    const first = dayNumberFromKey("2026-01-01");
    for (let d = first; d < first + 365; d++) {
      if (isSaleDay(d)) continue;
      let count = 0;
      const endHour = startOfDayNumber(d + 1) / HOUR_MS;
      for (let h = startOfDayNumber(d) / HOUR_MS; h < endHour; h++) count += ordersInHour(h);
      expect(count).toBeGreaterThanOrEqual(1200);
      expect(count).toBeLessThanOrEqual(1600);
    }
  });

  it("peaks in the Lisbon evening on both sides of the October DST change", () => {
    const peakLocalHour = (from: string, to: string) => {
      const byHour = new Array<number>(24).fill(0);
      for (const o of simulateOrders(utc(from), utc(to))) byHour[zonedParts(o.placedAt).hour]++;
      return byHour.indexOf(Math.max(...byHour));
    };
    const summer = peakLocalHour("2026-10-11T00:00:00Z", "2026-10-25T00:00:00Z");
    const winter = peakLocalHour("2026-10-26T00:00:00Z", "2026-11-09T00:00:00Z");
    for (const hour of [summer, winter]) {
      expect(hour).toBeGreaterThanOrEqual(19);
      expect(hour).toBeLessThanOrEqual(22);
    }
  });
});

describe("orders", () => {
  it("adds up: subtotal from lines, discount, shipping, VAT inside the total", () => {
    const variantPrice = new Map(VARIANTS.map((v) => [v.id, v.priceCents]));
    const wrong: string[] = [];
    for (const o of ninetyDays) {
      const subtotal = o.items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);
      const units = o.items.reduce((sum, i) => sum + i.quantity, 0);
      const vat = COUNTRIES[o.country].vatRate;
      const money = [o.subtotalCents, o.discountCents, o.shippingCents, o.taxCents, o.totalCents];
      const ok =
        o.items.length > 0 &&
        new Set(o.items.map((i) => i.variantId)).size === o.items.length &&
        o.items.every((i) => i.quantity > 0 && i.unitPriceCents === variantPrice.get(i.variantId)) &&
        o.subtotalCents === subtotal &&
        o.itemCount === units &&
        o.totalCents === o.subtotalCents - o.discountCents + o.shippingCents &&
        o.taxCents === Math.round((o.totalCents * vat) / (1 + vat)) &&
        money.every((n) => Number.isInteger(n) && n >= 0);
      if (!ok) wrong.push(o.simKey);
    }
    expect(wrong).toEqual([]);
  });

  it("charges the zone rate below the free-shipping threshold, plus a bulky surcharge", () => {
    const bulky = new Set(
      PRODUCTS.filter((p) => p.type === "stool" || p.type === "side-table").map((p) => p.id),
    );
    const productOf = new Map(VARIANTS.map((v) => [v.id, v.productId]));
    let free = 0;
    for (const o of ninetyDays.slice(0, 20_000)) {
      const rule = SHIPPING_ZONES[COUNTRIES[o.country].zone];
      const goods = o.subtotalCents - o.discountCents;
      const bulkyUnits = o.items
        .filter((i) => bulky.has(productOf.get(i.variantId) ?? 0))
        .reduce((sum, i) => sum + i.quantity, 0);
      const base = goods >= rule.freeFromCents ? 0 : rule.shippingCents;
      if (base === 0) free++;
      expect(o.shippingCents).toBe(base + bulkyUnits * 1500);
    }
    expect(free).toBeGreaterThan(0);
  });

  it("discounts most orders during a sale and a few first orders otherwise", () => {
    const sale = ninetyDays.filter((o) => isSaleDay(zonedParts(o.placedAt).dayNumber));
    const normal = ninetyDays.filter((o) => !isSaleDay(zonedParts(o.placedAt).dayNumber));
    const share = (list: SimOrder[]) => list.filter((o) => o.discountCents > 0).length / list.length;
    expect(share(sale)).toBeGreaterThan(0.8);
    expect(sale.every((o) => o.discountCode === null || o.discountCode === "TIDE15")).toBe(true);
    expect(share(normal)).toBeLessThan(0.1);
    expect(normal.filter((o) => o.discountCode).every((o) => !o.isReturning)).toBe(true);
  });

  it("averages a believable basket", () => {
    const aov = ninetyDays.reduce((s, o) => s + o.totalCents, 0) / ninetyDays.length / 100;
    expect(aov).toBeGreaterThan(60);
    expect(aov).toBeLessThan(100);
  });
});

describe("customers", () => {
  it("brings back about a third of orders from returning customers", () => {
    const share = ninetyDays.filter((o) => o.isReturning).length / ninetyDays.length;
    expect(Math.abs(share - RETURNING_SHARE)).toBeLessThan(0.01);
  });

  it("gives new customers this hour's ids and returning ones an earlier first order", () => {
    for (const o of ninetyDays.slice(0, 30_000)) {
      const hour = Math.floor(o.placedAt / HOUR_MS);
      if (o.isReturning) expect(firstOrderHour(o.customer.id)).toBeLessThan(hour);
      else expect(firstOrderHour(o.customer.id)).toBe(hour);
    }
  });

  it("favours recent buyers among returning customers", () => {
    const gaps = ninetyDays
      .filter((o) => o.isReturning)
      .map((o) => Math.floor(o.placedAt / HOUR_MS) - firstOrderHour(o.customer.id));
    const withinTwoWeeks = gaps.filter((g) => g <= 14 * 24).length / gaps.length;
    expect(withinTwoWeeks).toBeGreaterThan(0.45);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(120 * 24);
  });

  it("uses reserved example.com addresses, unique per customer, and no famous names", () => {
    const emails = new Map<number, string>();
    const wrong: string[] = [];
    const pattern = /^[a-z]+\.[a-z]+\.\d+@example\.com$/;
    for (const o of ninetyDays) {
      if (
        !pattern.test(o.customer.email) ||
        o.country !== o.customer.country ||
        BLOCKED_NAMES.has(o.customer.name)
      ) {
        wrong.push(o.simKey);
      }
      emails.set(o.customer.id, o.customer.email);
    }
    expect(wrong).toEqual([]);
    expect(new Set(emails.values()).size).toBe(emails.size);
  });
});
