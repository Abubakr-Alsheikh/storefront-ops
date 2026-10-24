/**
 * Simulator identity. Changing any rule in `src/lib/sim/` or the catalogue
 * changes history: bump SIM_VERSION so a database written by the old rules
 * is reseeded (locally) or flagged by /api/health (in production).
 */
export const SIM_VERSION = 1;

/** Root seed for every random stream. */
export const SIM_SEED = `tidewell-v${SIM_VERSION}`;

export const HOUR_MS = 3_600_000;

/**
 * Hour 0 for customer ids. New customers in UTC hour `h` get ids
 * `(h - CUSTOMER_EPOCH_HOUR) * CUSTOMERS_PER_HOUR + n`, so ids stay small
 * and positive for simulated time after 2025-01-01.
 */
export const CUSTOMER_EPOCH_HOUR = Date.UTC(2025, 0, 1) / HOUR_MS;

/** Room for new customers in one hour; well above the busiest sale hour. */
export const CUSTOMERS_PER_HOUR = 512;

/** The busiest hour may never place more orders than this. */
export const MAX_ORDERS_PER_HOUR = CUSTOMERS_PER_HOUR;
