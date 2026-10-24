import { COUNTRIES, COUNTRY_CODES, type CountryCode } from "@/lib/data/countries";
import { BLOCKED_NAMES, NAMES, emailSlug } from "@/lib/data/names";
import { CUSTOMERS_PER_HOUR, CUSTOMER_EPOCH_HOUR, SIM_SEED } from "./config";
import { rngFor, weightedPicker, type Rng } from "./prng";

/**
 * Customers are generated from their id alone. A new customer placing the
 * n-th first order in UTC hour `h` gets id `(h - epoch) * CUSTOMERS_PER_HOUR + n`,
 * so any hour can be simulated without knowing how many customers came
 * before it, and a returning customer is always someone whose first order
 * really happened in an earlier hour.
 */

export interface SimCustomer {
  id: number;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  country: CountryCode;
  city: string;
}

const pickCountry = weightedPicker(
  COUNTRY_CODES,
  COUNTRY_CODES.map((c) => COUNTRIES[c].share),
);

/** Bigger cities first; a gentle power law spreads the rest. */
const cityPickers = Object.fromEntries(
  COUNTRY_CODES.map((code) => {
    const cities = COUNTRIES[code].cities;
    return [code, weightedPicker(cities, cities.map((_, i) => 1 / (i + 1) ** 0.9))];
  }),
) as Record<CountryCode, (rng: Rng) => string>;

function pickFrom<T>(rng: Rng, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length)];
}

export function newCustomerId(hour: number, n: number): number {
  if (hour < CUSTOMER_EPOCH_HOUR) {
    throw new RangeError("The simulator starts on 2025-01-01");
  }
  if (n < 0 || n >= CUSTOMERS_PER_HOUR) {
    throw new RangeError(`Customer slot ${n} is outside the hour`);
  }
  return (hour - CUSTOMER_EPOCH_HOUR) * CUSTOMERS_PER_HOUR + n;
}

/** The UTC hour in which customer `id` placed their first order. */
export function firstOrderHour(id: number): number {
  return CUSTOMER_EPOCH_HOUR + Math.floor(id / CUSTOMERS_PER_HOUR);
}

export function customerById(id: number): SimCustomer {
  const rng = rngFor(SIM_SEED, "customer", id);
  const country = pickCountry(rng);
  const names = NAMES[country];
  let firstName: string;
  let lastName: string;
  do {
    firstName = pickFrom(rng, names.first);
    lastName = pickFrom(rng, names.last);
  } while (BLOCKED_NAMES.has(`${firstName} ${lastName}`));
  return {
    id,
    firstName,
    lastName,
    name: `${firstName} ${lastName}`,
    // The id keeps every address unique; example.com is reserved for examples.
    email: `${emailSlug(firstName)}.${emailSlug(lastName)}.${id}@example.com`,
    country,
    city: cityPickers[country](rng),
  };
}
