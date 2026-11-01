import { describe, expect, it } from "vitest";
import { addRecent, parseRecent, type RecentItem } from "./recent";

const item = (n: number): RecentItem => ({ kind: "order", href: `/orders/${n}`, label: `#${n}`, detail: "Test Customer" });

describe("addRecent", () => {
  it("puts the newest first and keeps five", () => {
    let list: RecentItem[] = [];
    for (let n = 1; n <= 7; n++) list = addRecent(list, item(n));
    expect(list.map((i) => i.href)).toEqual(["/orders/7", "/orders/6", "/orders/5", "/orders/4", "/orders/3"]);
  });

  it("moves a repeat to the front instead of listing it twice", () => {
    const list = addRecent(addRecent(addRecent([], item(1)), item(2)), item(1));
    expect(list.map((i) => i.href)).toEqual(["/orders/1", "/orders/2"]);
  });
});

describe("parseRecent", () => {
  it("reads back what was stored", () => {
    expect(parseRecent(JSON.stringify([item(1)]))).toEqual([item(1)]);
  });

  it("survives anything else in storage", () => {
    expect(parseRecent(null)).toEqual([]);
    expect(parseRecent("{not json")).toEqual([]);
    expect(parseRecent('{"a":1}')).toEqual([]);
    expect(parseRecent(JSON.stringify([null, 3, { kind: "order" }]))).toEqual([]);
  });

  it("refuses a link that leaves the app", () => {
    expect(parseRecent(JSON.stringify([{ ...item(1), href: "https://example.com" }]))).toEqual([]);
    expect(parseRecent(JSON.stringify([{ ...item(1), kind: "other" }]))).toEqual([]);
  });
});
