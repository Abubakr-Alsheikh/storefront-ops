import type { MetadataRoute } from "next";
import { NAV_ITEMS } from "@/lib/nav";
import { site } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return NAV_ITEMS.map((item) => ({ url: `${site.url}${item.href === "/" ? "" : item.href}` }));
}
