# Storefront Ops

**Concept · self-initiated**

Storefront Ops is the operations dashboard for Tidewell Goods, a fictional online homeware shop. It is a portfolio piece by [Abubakr Alsheikh](https://abubakr-alsheikh.netlify.app): the internal system a store team would open every morning, built with the care an engineer would want to read.

Status: **in development**. Live link, screenshots and measured results land here when it ships.

## What it will do

- **Overview**: revenue, orders, average order value and conversion for a chosen range, with charts that compare it to the previous period.
- **Live order feed**: new orders arrive in real time over server-sent events and the numbers update as they land.
- **Orders**: 90 days of history (about 125,000 orders) in one virtualised table that stays smooth while you filter, sort and search, with every filter kept in the URL so a view can be shared.
- **Order details**: line items, customer, payment and a status timeline, with optimistic status changes.
- **Inventory**: stock levels with low-stock warnings and restock actions.
- **Customers**: lifetime value, order history and segments.
- Keyboard navigation throughout, light and dark mode, and a mobile layout.

Tidewell Goods, its products, customers and orders are invented. The demo database resets every night.

## Stack

- [Next.js 16](https://nextjs.org) (App Router), React 19, TypeScript (strict)
- [Hono](https://hono.dev) API inside a Next.js route handler, with a typed RPC client and [Zod](https://zod.dev) validation
- [Drizzle ORM](https://orm.drizzle.team) on PostgreSQL ([Neon](https://neon.tech) in production, [PGlite](https://pglite.dev) locally and in tests)
- [TanStack Query](https://tanstack.com/query), [TanStack Table](https://tanstack.com/table) and [TanStack Virtual](https://tanstack.com/virtual)
- [Recharts](https://recharts.org), [Motion](https://motion.dev), [nuqs](https://nuqs.dev) for URL state
- Tailwind CSS 4, IBM Plex Sans and IBM Plex Mono
- [Vitest](https://vitest.dev)
- Netlify (hosting, functions, a scheduled nightly reset)

## Scripts

```bash
npm run dev         # local dev server (uses an embedded PGlite database when DATABASE_URL is unset)
npm run build       # production build
npm start           # serve the production build
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
npm test            # Vitest
```

## Licence

Code: MIT. Product photographs belong to their photographers and are credited in the app.
