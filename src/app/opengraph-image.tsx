import { cacheLife } from "next/cache";
import { ImageResponse } from "next/og";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { simulateOrders } from "@/lib/sim/orders";
import { hourSessions } from "@/lib/sim/rate";
import { site } from "@/lib/site";
import { startOfDayNumber, zonedParts } from "@/lib/tz";

export const alt = `${site.name}: the overview of ${site.store.name}, with the last seven days of revenue, orders and conversion.`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const DAYS = 7;
const HOUR_MS = 3_600_000;

// An image cannot read CSS: these are the light theme's tokens.
const COLOR = { canvas: "#f6f5f1", surface: "#ffffff", ink: "#16181b", muted: "#5b6067", line: "#e2dfd7", accent: "#0b6e7a" };

/** The last seven whole days, from the same simulator that feeds the database. */
function lastDays(now: number) {
  const today = zonedParts(now).dayNumber;
  return Array.from({ length: DAYS }, (_, i) => {
    const day = today - DAYS + i;
    const from = startOfDayNumber(day);
    const to = startOfDayNumber(day + 1);
    const orders = simulateOrders(from, to);
    let sessions = 0;
    for (let start = from; start < to; start += HOUR_MS) sessions += hourSessions(start / HOUR_MS);
    return { orders: orders.length, sessions, revenue: orders.reduce((sum, order) => sum + order.totalCents, 0) };
  });
}

/** The file Google serves to an agent with no user-agent string is a TTF, which this renderer can read. */
async function loadFont(weight: 400 | 500): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@${weight}`)).text();
    const url = css.match(/src: url\((.+?)\) format\('(?:truetype|opentype)'\)/)?.[1];
    return url ? await (await fetch(url)).arrayBuffer() : null;
  } catch {
    return null;
  }
}

/**
 * A crawler must not wait for seven simulated days and two font downloads, so
 * this runs at build time and again when the entry expires.
 */
async function snapshot() {
  "use cache";
  cacheLife("days");
  const [regular, medium] = await Promise.all([loadFont(400), loadFont(500)]);
  return { days: lastDays(Date.now()), regular, medium };
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: 28, background: COLOR.surface, border: `1px solid ${COLOR.line}`, borderRadius: 8 }}>
      <div style={{ fontSize: 22, color: COLOR.muted }}>{label}</div>
      <div style={{ fontSize: 50, fontWeight: 500, color: COLOR.ink, marginTop: 8 }}>{value}</div>
    </div>
  );
}

export default async function OpengraphImage() {
  const { days, regular, medium } = await snapshot();
  const revenue = days.reduce((sum, day) => sum + day.revenue, 0);
  const orders = days.reduce((sum, day) => sum + day.orders, 0);
  const sessions = days.reduce((sum, day) => sum + day.sessions, 0);
  const most = Math.max(...days.map((day) => day.revenue));
  const fonts = [
    ...(regular ? [{ name: "Plex", data: regular, weight: 400 as const }] : []),
    ...(medium ? [{ name: "Plex", data: medium, weight: 500 as const }] : []),
  ];

  return new ImageResponse(
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: 56, gap: 24, background: COLOR.canvas, fontFamily: fonts.length ? "Plex" : undefined }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontSize: 40, fontWeight: 500, color: COLOR.ink }}>{site.name}</div>
        <div style={{ fontSize: 24, color: COLOR.muted }}>{`${site.store.name} · last 7 days`}</div>
      </div>
      <div style={{ display: "flex", gap: 20 }}>
        <Stat label="Revenue" value={formatMoney(revenue, { whole: true })} />
        <Stat label="Orders" value={formatNumber(orders)} />
        <Stat label="Conversion rate" value={formatPercent(orders / sessions, 2)} />
      </div>
      <div style={{ display: "flex", flex: 1, alignItems: "flex-end", gap: 16, padding: 28, background: COLOR.surface, border: `1px solid ${COLOR.line}`, borderRadius: 8 }}>
        {days.map((day, i) => (
          <div key={i} style={{ flex: 1, height: `${(day.revenue / most) * 100}%`, background: COLOR.accent, borderRadius: 4 }} />
        ))}
      </div>
      <div style={{ display: "flex", fontSize: 22, color: COLOR.muted }}>{`${site.concept}. ${site.store.name} and its orders are fictional.`}</div>
    </div>,
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
