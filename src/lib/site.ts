/** Site-wide facts. One place for names, URLs and the concept disclosure. */
export const site = {
  name: "Storefront Ops",
  tagline: "Operations dashboard for an online store",
  /** The fictional shop the dashboard runs. */
  store: {
    name: "Tidewell Goods",
    kind: "Homeware and ceramics, shipped across Europe",
    currency: "EUR",
    timeZone: "Europe/Lisbon",
  },
  /** The live Netlify site; metadataBase, sitemap and robots build on it. */
  url: "https://storefront-ops.netlify.app",
  concept: "Concept · self-initiated",
  author: {
    name: "Abubakr Alsheikh",
    url: "https://abubakr-alsheikh.netlify.app",
  },
  repo: "https://github.com/Abubakr-Alsheikh/storefront-ops",
} as const;
