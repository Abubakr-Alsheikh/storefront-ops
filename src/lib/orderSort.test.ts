import { describe, expect, it } from "vitest";
import type { OrderRow } from "@/lib/contracts/orders";
import { compareOrders } from "./orderSort";

const order = (number: number, totalCents: number, placedAt: string, status: OrderRow["status"] = "paid"): OrderRow => ({
  number,
  totalCents,
  placedAt,
  status,
  customerName: "Test Customer",
  customerEmail: "test@example.com",
  country: "PT",
  city: "Porto",
  itemCount: 1,
  paymentMethod: "card",
});

const list = [
  order(101, 500, "2026-10-02T10:00:00.000Z", "shipped"),
  order(102, 900, "2026-10-01T10:00:00.000Z", "delivered"),
  order(103, 500, "2026-10-03T10:00:00.000Z", "paid"),
];
const numbers = (sort: Parameters<typeof compareOrders>[0], dir: "asc" | "desc") =>
  [...list].sort(compareOrders(sort, dir)).map((o) => o.number);

describe("compareOrders", () => {
  it("sorts by date, numbers and text in both directions", () => {
    expect(numbers("placed", "desc")).toEqual([103, 101, 102]);
    expect(numbers("placed", "asc")).toEqual([102, 101, 103]);
    expect(numbers("status", "asc")).toEqual([102, 103, 101]);
  });

  it("breaks ties on the order number, in the same direction", () => {
    expect(numbers("total", "asc")).toEqual([101, 103, 102]);
    expect(numbers("total", "desc")).toEqual([102, 103, 101]);
  });
});
