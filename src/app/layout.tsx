import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { Providers } from "@/components/providers";
import { site } from "@/lib/site";
import { PREFERENCES_SCRIPT } from "@/lib/theme";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: site.name, template: `%s · ${site.name}` },
  description: `${site.tagline}. ${site.concept}.`,
  openGraph: { type: "website", siteName: site.name, title: site.name, description: `${site.tagline}. ${site.concept}.`, url: site.url },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1113" },
  ],
};

/**
 * Netlify's free tier adds a line break and a comment to <head> on production
 * sites. React cannot match a whitespace text node there, so it throws away the
 * server HTML and renders the whole page again (error #418). This runs before
 * hydration and takes those nodes back out.
 */
const HEAD_CLEANUP_SCRIPT = "for(const n of[...document.head.childNodes])if(n.nodeType===3&&!n.data.trim())n.remove()";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The inline script sets data attributes on <html> before hydration.
    <html lang="en" suppressHydrationWarning className={`${plexSans.variable} ${plexMono.variable} antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: HEAD_CLEANUP_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: PREFERENCES_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
