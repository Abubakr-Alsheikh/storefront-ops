/**
 * Shipping countries, their share of orders, VAT and shipping zone. Prices
 * are VAT-inclusive and the same everywhere; the VAT inside them follows the
 * destination country (EU one-stop-shop rules for distance sales).
 */

export const COUNTRY_CODES = [
  "PT",
  "ES",
  "FR",
  "DE",
  "NL",
  "BE",
  "IT",
  "IE",
  "AT",
  "DK",
  "SE",
  "PL",
] as const;
export type CountryCode = (typeof COUNTRY_CODES)[number];

export type ShippingZone = "domestic" | "iberia" | "europe" | "europe-far";

export interface Country {
  code: CountryCode;
  name: string;
  /** Relative share of new customers. */
  share: number;
  vatRate: number;
  zone: ShippingZone;
  /** Largest first; earlier cities get more customers. */
  cities: readonly string[];
}

export const COUNTRIES: Record<CountryCode, Country> = {
  PT: { code: "PT", name: "Portugal", share: 24, vatRate: 0.23, zone: "domestic", cities: ["Lisboa", "Porto", "Braga", "Coimbra", "Cascais", "Aveiro", "Setúbal", "Faro", "Funchal", "Évora"] },
  ES: { code: "ES", name: "Spain", share: 13, vatRate: 0.21, zone: "iberia", cities: ["Madrid", "Barcelona", "Valencia", "Sevilla", "Bilbao", "Málaga", "Zaragoza", "Palma", "Valladolid", "Vigo"] },
  FR: { code: "FR", name: "France", share: 13, vatRate: 0.2, zone: "europe", cities: ["Paris", "Lyon", "Marseille", "Toulouse", "Bordeaux", "Nantes", "Lille", "Strasbourg", "Montpellier", "Rennes"] },
  DE: { code: "DE", name: "Germany", share: 14, vatRate: 0.19, zone: "europe", cities: ["Berlin", "Hamburg", "München", "Köln", "Frankfurt am Main", "Stuttgart", "Düsseldorf", "Leipzig", "Dresden", "Freiburg"] },
  NL: { code: "NL", name: "Netherlands", share: 7, vatRate: 0.21, zone: "europe", cities: ["Amsterdam", "Rotterdam", "Utrecht", "Den Haag", "Eindhoven", "Groningen", "Haarlem", "Leiden"] },
  BE: { code: "BE", name: "Belgium", share: 5, vatRate: 0.21, zone: "europe", cities: ["Bruxelles", "Antwerpen", "Gent", "Liège", "Brugge", "Leuven"] },
  IT: { code: "IT", name: "Italy", share: 8, vatRate: 0.22, zone: "europe", cities: ["Milano", "Roma", "Torino", "Bologna", "Firenze", "Napoli", "Verona", "Genova"] },
  IE: { code: "IE", name: "Ireland", share: 4, vatRate: 0.23, zone: "europe-far", cities: ["Dublin", "Cork", "Galway", "Limerick", "Waterford", "Kilkenny"] },
  AT: { code: "AT", name: "Austria", share: 3, vatRate: 0.2, zone: "europe", cities: ["Wien", "Graz", "Salzburg", "Linz", "Innsbruck"] },
  DK: { code: "DK", name: "Denmark", share: 3, vatRate: 0.25, zone: "europe-far", cities: ["København", "Aarhus", "Odense", "Aalborg"] },
  SE: { code: "SE", name: "Sweden", share: 3, vatRate: 0.25, zone: "europe-far", cities: ["Stockholm", "Göteborg", "Malmö", "Uppsala"] },
  PL: { code: "PL", name: "Poland", share: 3, vatRate: 0.23, zone: "europe-far", cities: ["Warszawa", "Kraków", "Wrocław", "Gdańsk", "Poznań", "Łódź"] },
};

export interface ZoneRule {
  /** Flat shipping price, VAT included. */
  shippingCents: number;
  /** Orders at or above this (after discount) ship free. */
  freeFromCents: number;
  /** Working days from dispatch to the door, inclusive range. */
  transitDays: readonly [number, number];
}

export const SHIPPING_ZONES: Record<ShippingZone, ZoneRule> = {
  domestic: { shippingCents: 490, freeFromCents: 5000, transitDays: [1, 2] },
  iberia: { shippingCents: 690, freeFromCents: 7500, transitDays: [2, 3] },
  europe: { shippingCents: 990, freeFromCents: 10000, transitDays: [2, 5] },
  "europe-far": { shippingCents: 1290, freeFromCents: 12000, transitDays: [3, 6] },
};
