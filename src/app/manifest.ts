import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: site.name,
    short_name: site.name,
    description: `${site.tagline}. ${site.concept}.`,
    start_url: "/",
    display: "standalone",
    // A manifest cannot read CSS: these are the light theme's canvas and accent.
    background_color: "#f6f5f1",
    theme_color: "#0b6e7a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
