import type { PaymentMethod } from "@/lib/domain";
import { formatNumber } from "@/lib/format";

/** Words of the orders screen (COPY.md §4). */
export const ordersCopy = {
  gridName: "Orders",
  searchPlaceholder: "Search by order number, name or email",
  filters: { status: "Status", date: "Date", country: "Country", payment: "Payment", amount: "Amount" },
  clearFilters: "Clear filters",
  apply: "Apply",
  from: "From",
  to: "To",
  min: "Min",
  max: "Max",
  columns: "Columns",
  density: { name: "Density", comfortable: "Comfortable", compact: "Compact" },
  headers: {
    number: "Order",
    placed: "Placed",
    customer: "Customer",
    country: "Country",
    items: "Items",
    total: "Total",
    payment: "Payment",
    status: "Status",
  },
  selectHeader: "Select",
  selectRow: (number: number) => `Select order #${number}`,
  count: (matching: number, total: number | undefined) =>
    total === undefined || matching === total
      ? `${formatNumber(matching)} orders`
      : `${formatNumber(matching)} of ${formatNumber(total)} orders`,
  emptyFilters: "No orders match these filters.",
  emptyFiltersHelp: "Widen the filters to see more of the order history.",
  emptySearch: (q: string) => `No orders match “${q}”.`,
  emptySearchHelp: "Check the number or try part of the name.",
  selected: (n: number) => `${formatNumber(n)} selected`,
  markShipped: "Mark as shipped",
  clearSelection: "Clear selection",
  skipped: (k: number) => `${k} of the selected orders cannot be shipped and will be skipped.`,
  tooMany: "Select at most 100 orders at a time.",
  shipped: (n: number) => `${formatNumber(n)} orders marked as shipped.`,
};

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  card: "Card",
  paypal: "PayPal",
  mbway: "MB WAY",
  klarna: "Klarna",
  apple_pay: "Apple Pay",
};
