import { SIM_SEED } from "@/lib/sim/config";
import { rngFor } from "@/lib/sim/prng";

/**
 * The Tidewell Goods catalogue: hand-written collections and product types,
 * combined into about 160 products and 420 SKUs. Every name is fictional.
 * Changing anything here changes simulated history, so bump SIM_VERSION.
 */

/** Photo slots from IMAGES.md: one photo per kind of object. */
export const IMAGE_SLOTS = [
  "mug",
  "plate",
  "bowl",
  "jug",
  "vase",
  "tumbler",
  "carafe",
  "napkins",
  "tablecloth",
  "throw",
  "candle",
  "board",
  "stool",
  "side-table",
] as const;
export type ImageSlot = (typeof IMAGE_SLOTS)[number];

type Family = "ceramics" | "glass" | "linen" | "wood" | "candles";

interface SizeOption {
  label: string;
  /** Multiplies the type's price and weight. */
  factor: number;
}

type Options =
  | { kind: "colour"; max: number }
  | { kind: "size"; sizes: readonly SizeOption[] }
  | { kind: "single" };

interface ProductTypeDef {
  key: string;
  code: string;
  /** Lower-case, as it reads after the collection name. */
  name: string;
  slot: ImageSlot;
  family: Family;
  priceCents: number;
  weightGrams: number;
  popularity: number;
  options: Options;
}

const T = (def: ProductTypeDef) => def;

export const PRODUCT_TYPES = [
  T({ key: "mug", code: "MUG", name: "mug", slot: "mug", family: "ceramics", priceCents: 2400, weightGrams: 380, popularity: 1.6, options: { kind: "colour", max: 3 } }),
  T({ key: "espresso-cups", code: "ESP", name: "espresso cups, set of 2", slot: "mug", family: "ceramics", priceCents: 2200, weightGrams: 260, popularity: 0.8, options: { kind: "colour", max: 3 } }),
  T({ key: "dinner-plate", code: "DPL", name: "dinner plate", slot: "plate", family: "ceramics", priceCents: 2800, weightGrams: 650, popularity: 1.3, options: { kind: "colour", max: 3 } }),
  T({ key: "side-plate", code: "SPL", name: "side plate", slot: "plate", family: "ceramics", priceCents: 2000, weightGrams: 400, popularity: 1.0, options: { kind: "colour", max: 3 } }),
  T({ key: "serving-platter", code: "PLT", name: "serving platter", slot: "plate", family: "ceramics", priceCents: 5400, weightGrams: 1500, popularity: 0.5, options: { kind: "colour", max: 2 } }),
  T({ key: "cereal-bowl", code: "CBL", name: "cereal bowl", slot: "bowl", family: "ceramics", priceCents: 2200, weightGrams: 420, popularity: 1.1, options: { kind: "colour", max: 3 } }),
  T({ key: "pasta-bowl", code: "PBL", name: "pasta bowl", slot: "bowl", family: "ceramics", priceCents: 2600, weightGrams: 560, popularity: 1.1, options: { kind: "colour", max: 3 } }),
  T({ key: "serving-bowl", code: "SBL", name: "serving bowl", slot: "bowl", family: "ceramics", priceCents: 4800, weightGrams: 1300, popularity: 0.6, options: { kind: "colour", max: 3 } }),
  T({ key: "jug", code: "JUG", name: "jug", slot: "jug", family: "ceramics", priceCents: 4200, weightGrams: 950, popularity: 0.5, options: { kind: "colour", max: 2 } }),
  T({ key: "milk-jug", code: "MJG", name: "milk jug", slot: "jug", family: "ceramics", priceCents: 2600, weightGrams: 380, popularity: 0.6, options: { kind: "colour", max: 2 } }),
  T({ key: "bud-vase", code: "BVS", name: "bud vase", slot: "vase", family: "ceramics", priceCents: 2400, weightGrams: 300, popularity: 0.8, options: { kind: "colour", max: 3 } }),
  T({ key: "tall-vase", code: "TVS", name: "tall vase", slot: "vase", family: "ceramics", priceCents: 6200, weightGrams: 1400, popularity: 0.5, options: { kind: "colour", max: 3 } }),
  T({ key: "tumblers", code: "TMB", name: "tumblers, set of 4", slot: "tumbler", family: "glass", priceCents: 3600, weightGrams: 1100, popularity: 1.0, options: { kind: "colour", max: 3 } }),
  T({ key: "wine-glasses", code: "WGL", name: "wine glasses, set of 2", slot: "tumbler", family: "glass", priceCents: 3800, weightGrams: 700, popularity: 0.6, options: { kind: "colour", max: 2 } }),
  T({ key: "carafe", code: "CRF", name: "carafe", slot: "carafe", family: "glass", priceCents: 3400, weightGrams: 750, popularity: 0.6, options: { kind: "colour", max: 2 } }),
  T({ key: "glass-vase", code: "GVS", name: "glass vase", slot: "vase", family: "glass", priceCents: 4600, weightGrams: 1200, popularity: 0.5, options: { kind: "colour", max: 2 } }),
  T({ key: "napkins", code: "NAP", name: "napkins, set of 4", slot: "napkins", family: "linen", priceCents: 3400, weightGrams: 320, popularity: 1.0, options: { kind: "colour", max: 4 } }),
  T({ key: "tablecloth", code: "TCL", name: "tablecloth", slot: "tablecloth", family: "linen", priceCents: 8900, weightGrams: 900, popularity: 0.5, options: { kind: "size", sizes: [{ label: "150 × 220 cm", factor: 1 }, { label: "150 × 300 cm", factor: 1.3 }] } }),
  T({ key: "table-runner", code: "RUN", name: "table runner", slot: "tablecloth", family: "linen", priceCents: 3900, weightGrams: 350, popularity: 0.5, options: { kind: "colour", max: 3 } }),
  T({ key: "throw", code: "THR", name: "throw", slot: "throw", family: "linen", priceCents: 12900, weightGrams: 1400, popularity: 0.5, options: { kind: "colour", max: 3 } }),
  T({ key: "chopping-board", code: "CHB", name: "chopping board", slot: "board", family: "wood", priceCents: 3800, weightGrams: 1200, popularity: 0.7, options: { kind: "size", sizes: [{ label: "Small", factor: 1 }, { label: "Large", factor: 1.45 }] } }),
  T({ key: "serving-board", code: "SVB", name: "serving board", slot: "board", family: "wood", priceCents: 4200, weightGrams: 1000, popularity: 0.6, options: { kind: "single" } }),
  T({ key: "stool", code: "STL", name: "stool", slot: "stool", family: "wood", priceCents: 17900, weightGrams: 4200, popularity: 0.25, options: { kind: "colour", max: 2 } }),
  T({ key: "side-table", code: "STB", name: "side table", slot: "side-table", family: "wood", priceCents: 26900, weightGrams: 7800, popularity: 0.15, options: { kind: "colour", max: 2 } }),
  T({ key: "pillar-candle", code: "PIL", name: "pillar candle", slot: "candle", family: "candles", priceCents: 1800, weightGrams: 450, popularity: 0.9, options: { kind: "colour", max: 3 } }),
  T({ key: "taper-candles", code: "TAP", name: "taper candles, set of 2", slot: "candle", family: "candles", priceCents: 1200, weightGrams: 160, popularity: 0.9, options: { kind: "colour", max: 3 } }),
  T({ key: "scented-candle", code: "SCN", name: "scented candle", slot: "candle", family: "candles", priceCents: 2900, weightGrams: 400, popularity: 1.0, options: { kind: "size", sizes: [{ label: "180 g", factor: 1 }, { label: "320 g", factor: 1.55 }] } }),
] as const satisfies readonly ProductTypeDef[];

export type ProductTypeKey = (typeof PRODUCT_TYPES)[number]["key"];

/** Supplier lead time by family, in days. */
const LEAD_TIME_DAYS: Record<Family, number> = {
  ceramics: 28,
  glass: 35,
  linen: 21,
  wood: 49,
  candles: 14,
};

/** Wood pieces come in the same finishes in every collection. */
const WOOD_FINISHES = ["Oak", "Walnut"];

/** Glass tints unless a collection names its own. */
const GLASS_TINTS = ["Clear", "Smoke", "Amber"];

interface CollectionDef {
  key: string;
  code: string;
  name: string;
  /** Glazes and textile colours, in order of popularity. Candles use them too. */
  palette: readonly string[];
  /** Glass tints, when the collection has its own. */
  glass?: readonly string[];
  priceFactor: number;
  popularity: number;
  types: readonly ProductTypeKey[];
}

export const COLLECTIONS: readonly CollectionDef[] = [
  {
    key: "enseada",
    code: "ENS",
    name: "Enseada",
    palette: ["Sea salt", "Tidal blue", "Sand"],
    glass: ["Clear", "Sea glass"],
    priceFactor: 1,
    popularity: 1.4,
    types: ["mug", "espresso-cups", "dinner-plate", "side-plate", "serving-platter", "cereal-bowl", "pasta-bowl", "serving-bowl", "jug", "milk-jug", "bud-vase", "tall-vase", "tumblers", "carafe", "napkins", "scented-candle"],
  },
  {
    key: "salgado",
    code: "SAL",
    name: "Salgado",
    palette: ["Chalk", "Olive", "Charcoal"],
    priceFactor: 1.1,
    popularity: 1.2,
    types: ["mug", "espresso-cups", "dinner-plate", "side-plate", "serving-platter", "cereal-bowl", "pasta-bowl", "serving-bowl", "jug", "tall-vase", "serving-board", "pillar-candle", "napkins", "tablecloth"],
  },
  {
    key: "alfama",
    code: "ALF",
    name: "Alfama",
    palette: ["Natural", "Oat", "Terracotta", "Indigo"],
    priceFactor: 1.05,
    popularity: 1.1,
    types: ["napkins", "tablecloth", "table-runner", "throw", "mug", "dinner-plate", "side-plate", "pasta-bowl", "taper-candles", "scented-candle", "serving-board", "tumblers"],
  },
  {
    key: "penedo",
    code: "PEN",
    name: "Penedo",
    palette: ["Granite", "Moss", "Bark"],
    priceFactor: 1,
    popularity: 0.9,
    types: ["mug", "dinner-plate", "side-plate", "cereal-bowl", "serving-bowl", "milk-jug", "chopping-board", "serving-board", "stool", "side-table", "throw", "pillar-candle", "scented-candle", "tall-vase"],
  },
  {
    key: "mareta",
    code: "MAR",
    name: "Mareta",
    palette: ["Sky", "Coral", "Bone"],
    priceFactor: 0.95,
    popularity: 1,
    types: ["mug", "espresso-cups", "dinner-plate", "side-plate", "pasta-bowl", "cereal-bowl", "bud-vase", "jug", "napkins", "table-runner", "tumblers", "wine-glasses", "taper-candles"],
  },
  {
    key: "orvalho",
    code: "ORV",
    name: "Orvalho",
    palette: ["Mist", "Smoke", "Amber"],
    glass: ["Clear", "Smoke", "Amber"],
    priceFactor: 1.1,
    popularity: 0.9,
    types: ["tumblers", "wine-glasses", "carafe", "glass-vase", "scented-candle", "taper-candles", "napkins", "table-runner", "serving-board", "side-plate", "pasta-bowl"],
  },
  {
    key: "sobreiro",
    code: "SOB",
    name: "Sobreiro",
    palette: ["Cork", "Moss", "Chalk"],
    priceFactor: 1.15,
    popularity: 0.8,
    types: ["chopping-board", "serving-board", "stool", "side-table", "throw", "pillar-candle", "scented-candle", "mug", "serving-bowl", "cereal-bowl", "napkins", "bud-vase"],
  },
  {
    key: "tecela",
    code: "TEC",
    name: "Tecelã",
    palette: ["Stone", "Sage", "Rust"],
    priceFactor: 1.05,
    popularity: 0.8,
    types: ["napkins", "tablecloth", "table-runner", "throw", "stool", "pasta-bowl", "dinner-plate", "mug", "scented-candle", "taper-candles", "tall-vase"],
  },
  {
    key: "pavio",
    code: "PAV",
    name: "Pavio",
    palette: ["Ember", "Ivory", "Smoke"],
    priceFactor: 0.9,
    popularity: 1,
    types: ["pillar-candle", "taper-candles", "scented-candle", "mug", "espresso-cups", "dinner-plate", "side-plate", "cereal-bowl", "throw", "napkins", "bud-vase", "tall-vase", "carafe", "serving-board"],
  },
  {
    key: "juncal",
    code: "JUN",
    name: "Juncal",
    palette: ["Reed", "Pond", "Sand"],
    glass: ["Reed", "Clear", "Pond"],
    priceFactor: 1,
    popularity: 0.9,
    types: ["tumblers", "wine-glasses", "carafe", "glass-vase", "mug", "pasta-bowl", "serving-bowl", "dinner-plate", "milk-jug", "napkins", "tablecloth", "scented-candle", "bud-vase"],
  },
  {
    key: "areal",
    code: "ARE",
    name: "Areal",
    palette: ["Dune", "Shell", "Clay"],
    priceFactor: 1.2,
    popularity: 1.1,
    types: ["mug", "espresso-cups", "dinner-plate", "side-plate", "serving-platter", "cereal-bowl", "pasta-bowl", "serving-bowl", "jug", "bud-vase", "tall-vase", "throw", "table-runner", "side-table", "serving-board", "taper-candles"],
  },
  {
    key: "cais",
    code: "CAI",
    name: "Cais",
    palette: ["Rope", "Navy", "Slate"],
    priceFactor: 0.95,
    popularity: 0.9,
    types: ["mug", "dinner-plate", "pasta-bowl", "serving-bowl", "tumblers", "carafe", "chopping-board", "stool", "side-table", "throw", "napkins", "pillar-candle", "scented-candle", "serving-platter"],
  },
];

export interface Product {
  id: number;
  slug: string;
  name: string;
  collection: string;
  collectionName: string;
  type: ProductTypeKey;
  imageSlot: ImageSlot;
}

export interface Variant {
  id: number;
  productId: number;
  sku: string;
  optionLabel: string;
  priceCents: number;
  weightGrams: number;
  leadTimeDays: number;
  /** Relative chance of landing in a basket. */
  popularity: number;
}

/** Colourways later in a palette sell less. */
const OPTION_RANK_FACTOR = [1, 0.75, 0.55, 0.4];

function wholeEuros(cents: number): number {
  return Math.round(cents / 100) * 100;
}

function upperFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function build() {
  const typeByKey = new Map<string, ProductTypeDef>(PRODUCT_TYPES.map((t) => [t.key, t]));
  const products: Product[] = [];
  const variants: Variant[] = [];

  for (const collection of COLLECTIONS) {
    for (const typeKey of collection.types) {
      const type = typeByKey.get(typeKey);
      if (!type) throw new Error(`Unknown product type ${typeKey}`);
      const product: Product = {
        id: products.length + 1,
        slug: `${collection.key}-${type.key}`,
        name: `${collection.name} ${type.name}`,
        collection: collection.key,
        collectionName: collection.name,
        type: type.key as ProductTypeKey,
        imageSlot: type.slot,
      };
      products.push(product);

      const colours =
        type.family === "wood"
          ? WOOD_FINISHES
          : type.family === "glass"
            ? (collection.glass ?? GLASS_TINTS)
            : collection.palette;
      const options: SizeOption[] =
        type.options.kind === "colour"
          ? colours.slice(0, type.options.max).map((label) => ({ label, factor: 1 }))
          : type.options.kind === "size"
            ? [...type.options.sizes]
            : [{ label: "One size", factor: 1 }];

      // A steady per-product jitter, so best sellers are not a pure function
      // of type and collection.
      const jitter = 0.7 + 0.6 * rngFor(SIM_SEED, "product", product.slug)();

      options.forEach((option, rank) => {
        variants.push({
          id: variants.length + 1,
          productId: product.id,
          sku: `${collection.code}-${type.code}-${String(rank + 1).padStart(2, "0")}`,
          optionLabel: upperFirst(option.label),
          priceCents: wholeEuros(type.priceCents * collection.priceFactor * option.factor),
          weightGrams: Math.round(type.weightGrams * option.factor),
          leadTimeDays: LEAD_TIME_DAYS[type.family],
          popularity:
            type.popularity *
            collection.popularity *
            jitter *
            OPTION_RANK_FACTOR[Math.min(rank, OPTION_RANK_FACTOR.length - 1)],
        });
      });
    }
  }
  return { products, variants };
}

const built = build();

export const PRODUCTS: readonly Product[] = built.products;
export const VARIANTS: readonly Variant[] = built.variants;

const productIndex = new Map(PRODUCTS.map((p) => [p.id, p]));
const variantIndex = new Map(VARIANTS.map((v) => [v.id, v]));

export function productById(id: number): Product | undefined {
  return productIndex.get(id);
}

export function variantById(id: number): Variant | undefined {
  return variantIndex.get(id);
}
