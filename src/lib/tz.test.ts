import { describe, expect, it } from "vitest";
import {
  addZonedDays,
  dayKeyAt,
  dayKeyFromNumber,
  dayNumberFromKey,
  startOfZonedDay,
  tzOffsetMinutes,
  zonedParts,
  zonedToUtc,
} from "./tz";

const HOUR = 3_600_000;
const utc = (iso: string) => Date.parse(iso);

describe("Lisbon offsets", () => {
  it("is UTC+1 in summer and UTC+0 in winter", () => {
    expect(tzOffsetMinutes(utc("2026-07-01T12:00:00Z"))).toBe(60);
    expect(tzOffsetMinutes(utc("2026-12-01T12:00:00Z"))).toBe(0);
  });

  it("changes at 01:00 UTC on the last Sunday of March and October", () => {
    expect(tzOffsetMinutes(utc("2026-03-29T00:59:59Z"))).toBe(0);
    expect(tzOffsetMinutes(utc("2026-03-29T01:00:00Z"))).toBe(60);
    expect(tzOffsetMinutes(utc("2026-10-25T00:59:59Z"))).toBe(60);
    expect(tzOffsetMinutes(utc("2026-10-25T01:00:00Z"))).toBe(0);
  });

  it("reads wall-clock parts", () => {
    const p = zonedParts(utc("2026-07-14T19:05:09Z"));
    expect(p).toMatchObject({
      year: 2026,
      month: 7,
      day: 14,
      hour: 20,
      minute: 5,
      second: 9,
      weekday: 2,
      offsetMinutes: 60,
    });
    expect(dayKeyFromNumber(p.dayNumber)).toBe("2026-07-14");
  });

  it("puts a late-evening UTC instant on the next Lisbon day in summer", () => {
    expect(dayKeyAt(utc("2026-07-14T23:30:00Z"))).toBe("2026-07-15");
    expect(dayKeyAt(utc("2026-12-14T23:30:00Z"))).toBe("2026-12-14");
  });
});

describe("zonedToUtc", () => {
  it("round-trips ordinary times", () => {
    expect(zonedToUtc({ year: 2026, month: 7, day: 14, hour: 20, minute: 5 })).toBe(
      utc("2026-07-14T19:05:00Z"),
    );
    expect(zonedToUtc({ year: 2026, month: 1, day: 2, hour: 9 })).toBe(
      utc("2026-01-02T09:00:00Z"),
    );
  });

  it("moves a time inside the spring gap forward", () => {
    // 01:30 does not exist on 29 March 2026; it reads as 02:30 WEST.
    expect(zonedToUtc({ year: 2026, month: 3, day: 29, hour: 1, minute: 30 })).toBe(
      utc("2026-03-29T01:30:00Z"),
    );
  });

  it("resolves a repeated autumn time to its first occurrence", () => {
    expect(zonedToUtc({ year: 2026, month: 10, day: 25, hour: 1, minute: 30 })).toBe(
      utc("2026-10-25T00:30:00Z"),
    );
  });
});

describe("days", () => {
  it("converts keys and numbers both ways", () => {
    expect(dayNumberFromKey("1970-01-02")).toBe(1);
    expect(dayKeyFromNumber(dayNumberFromKey("2026-10-24"))).toBe("2026-10-24");
    expect(() => dayNumberFromKey("2026-02-30")).toThrow(RangeError);
    expect(() => dayNumberFromKey("24/10/2026")).toThrow(RangeError);
  });

  it("finds local midnight", () => {
    expect(startOfZonedDay(utc("2026-07-14T10:00:00Z"))).toBe(utc("2026-07-13T23:00:00Z"));
    expect(startOfZonedDay(utc("2026-12-14T10:00:00Z"))).toBe(utc("2026-12-14T00:00:00Z"));
  });

  it("has a 25-hour day when the clocks go back", () => {
    const start = startOfZonedDay(utc("2026-10-25T12:00:00Z"));
    const next = addZonedDays(start, 1);
    expect(next - start).toBe(25 * HOUR);
  });

  it("has a 23-hour day when the clocks go forward", () => {
    const start = startOfZonedDay(utc("2026-03-29T12:00:00Z"));
    expect(addZonedDays(start, 1) - start).toBe(23 * HOUR);
  });

  it("keeps the wall-clock time when adding days across DST", () => {
    const evening = utc("2026-10-24T20:00:00Z"); // 21:00 WEST
    const nextEvening = addZonedDays(evening, 1);
    expect(zonedParts(nextEvening).hour).toBe(21);
    expect(nextEvening).toBe(utc("2026-10-25T21:00:00Z"));
    expect(addZonedDays(nextEvening, -1)).toBe(evening);
  });
});
