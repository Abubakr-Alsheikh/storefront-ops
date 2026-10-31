import type { OrderRow } from "@/lib/contracts/orders";
import type { OrderSort } from "@/lib/domain";

const KEYS: Record<OrderSort, (order: OrderRow) => string | number> = {
  number: (o) => o.number,
  placed: (o) => Date.parse(o.placedAt),
  customer: (o) => o.customerName,
  country: (o) => o.country,
  items: (o) => o.itemCount,
  total: (o) => o.totalCents,
  status: (o) => o.status,
};

/** Sorts orders held in memory the way the API sorts pages: the order number breaks ties. */
export function compareOrders(sort: OrderSort, dir: "asc" | "desc") {
  const key = KEYS[sort];
  const sign = dir === "asc" ? 1 : -1;
  return (a: OrderRow, b: OrderRow) => {
    const x = key(a);
    const y = key(b);
    const order = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "en-GB");
    return sign * order || sign * (a.number - b.number);
  };
}
