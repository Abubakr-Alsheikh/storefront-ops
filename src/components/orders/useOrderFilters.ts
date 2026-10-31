"use client";

import { parseAsArrayOf, parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { useMemo } from "react";
import type { OrdersApiQuery } from "@/lib/api/ordersWindow";
import { COUNTRY_CODES } from "@/lib/data/countries";
import { ORDER_SORTS, ORDER_STATUSES, PAYMENT_METHODS } from "@/lib/domain";

const parsers = {
  status: parseAsArrayOf(parseAsStringLiteral(ORDER_STATUSES)),
  country: parseAsArrayOf(parseAsStringLiteral(COUNTRY_CODES)),
  payment: parseAsArrayOf(parseAsStringLiteral(PAYMENT_METHODS)),
  from: parseAsString,
  to: parseAsString,
  min: parseAsInteger,
  max: parseAsInteger,
  q: parseAsString,
  sort: parseAsStringLiteral(ORDER_SORTS).withDefault("placed"),
  dir: parseAsStringLiteral(["asc", "desc"] as const).withDefault("desc"),
};

export const NO_FILTERS = {
  status: null,
  country: null,
  payment: null,
  from: null,
  to: null,
  min: null,
  max: null,
  q: null,
};

/**
 * Filters, sort and search in the URL. The API validates what arrives, so a
 * link and a request can never disagree, and no validation code ships here.
 */
export function useOrderFilters() {
  const [state, setState] = useQueryStates(parsers);
  const query = useMemo<OrdersApiQuery>(() => {
    const out: OrdersApiQuery = {};
    if (state.status?.length) out.status = state.status.join(",");
    if (state.country?.length) out.country = state.country.join(",");
    if (state.payment?.length) out.payment = state.payment.join(",");
    if (state.from) out.from = state.from;
    if (state.to) out.to = state.to;
    if (state.min !== null) out.min = String(state.min);
    if (state.max !== null) out.max = String(state.max);
    if (state.q) out.q = state.q;
    if (state.sort !== "placed") out.sort = state.sort;
    if (state.dir !== "desc") out.dir = state.dir;
    return out;
  }, [state]);
  const hasFilters = Boolean(
    state.status?.length ||
      state.country?.length ||
      state.payment?.length ||
      state.from ||
      state.to ||
      state.min !== null ||
      state.max !== null ||
      state.q,
  );
  return { state, setState, query, hasFilters };
}

export type OrderFiltersApi = ReturnType<typeof useOrderFilters>;
