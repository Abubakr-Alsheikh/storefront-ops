"use client";

import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { Overview } from "@/lib/contracts/overview";
import { COUNTRIES } from "@/lib/data/countries";
import { overviewCopy } from "@/lib/data/copy/overview";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";

function Panel({ id, title, children, className }: { id: string; title: string; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={`min-w-0 rounded-md border border-line bg-surface p-4 xl:p-5 ${className ?? ""}`}>
      <h2 id={id} className="mb-3 text-lg font-medium text-ink">{title}</h2>
      {children}
    </section>
  );
}

function Skeletons({ count, height }: { count: number; height: string }) {
  return (
    <div className="flex flex-col gap-1">
      {Array.from({ length: count }, (_, i) => <Skeleton key={i} className={height} />)}
    </div>
  );
}

const TH = "h-8 px-2 text-xs font-medium text-ink-muted first:pl-0 last:pr-0";
const TD = "h-8 px-2 first:pl-0 last:pr-0";

/** Horizontal bars, sorted, with every value written out: a table in chart form. */
export function StatusBreakdown({ overview }: { overview?: Overview }) {
  const rows = overview ? [...overview.statuses].sort((a, b) => b.orders - a.orders) : null;
  const max = rows ? Math.max(1, ...rows.map((r) => r.orders)) : 1;
  return (
    <Panel id="statuses-title" title={overviewCopy.statuses}>
      {!rows ? (
        <Skeletons count={6} height="h-7" />
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map((row) => (
            <li key={row.status} className="flex h-7 items-center gap-2">
              <span className="w-20 shrink-0"><StatusBadge status={row.status} /></span>
              <span aria-hidden="true" className="h-2 min-w-0 flex-1 rounded-sm bg-surface-2">
                <span className="block h-full rounded-sm bg-accent" style={{ width: `${(row.orders / max) * 100}%` }} />
              </span>
              <span className="w-14 shrink-0 text-right text-sm tabular-nums">{formatNumber(row.orders)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** No photo yet: the neutral tile with the type's initial (IMAGES.md). */
function ProductTile({ slot }: { slot: string }) {
  return (
    <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded bg-surface-2 font-mono text-xs text-ink-muted uppercase">
      {slot.charAt(0)}
    </span>
  );
}

export function TopProducts({ overview }: { overview?: Overview }) {
  return (
    <Panel id="products-title" title={overviewCopy.topProducts}>
      {!overview ? (
        <Skeletons count={6} height="h-10" />
      ) : overview.topProducts.length === 0 ? (
        <p className="text-sm text-ink-muted">{overviewCopy.noData}</p>
      ) : (
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className={`${TH} text-left`}>{overviewCopy.product}</th>
              <th scope="col" className={`${TH} w-14 text-right`}>{overviewCopy.units}</th>
              <th scope="col" className={`${TH} w-24 text-right`}>{overviewCopy.revenue}</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {overview.topProducts.map((p) => (
              <tr key={p.productId} className="border-b border-line last:border-0">
                <td className="h-11 pr-2">
                  <span className="flex items-center gap-2">
                    <ProductTile slot={p.imageSlot} />
                    <span title={p.name} className="line-clamp-2 leading-5">{p.name}</span>
                  </span>
                </td>
                <td className={`${TD} text-right`}>{formatNumber(p.units)}</td>
                <td className={`${TD} text-right`}>{formatMoney(p.revenueCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

export function CountryTable({ overview }: { overview?: Overview }) {
  return (
    <Panel id="countries-title" title={overviewCopy.countries}>
      {!overview ? (
        <Skeletons count={13} height="h-7" />
      ) : overview.countries.length === 0 ? (
        <p className="text-sm text-ink-muted">{overviewCopy.noData}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className={`${TH} text-left`}>{overviewCopy.country}</th>
              <th scope="col" className={`${TH} text-right`}>{overviewCopy.orders}</th>
              <th scope="col" className={`${TH} text-right`}>{overviewCopy.revenue}</th>
              <th scope="col" className={`${TH} text-right`}>{overviewCopy.share}</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {overview.countries.map((c) => (
              <tr key={c.country} className="border-b border-line last:border-0">
                <td className={TD}>{COUNTRIES[c.country].name}</td>
                <td className={`${TD} text-right`}>{formatNumber(c.orders)}</td>
                <td className={`${TD} text-right`}>{formatMoney(c.revenueCents, { whole: true })}</td>
                <td className={`${TD} text-right text-ink-muted`}>{formatPercent(c.share)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
