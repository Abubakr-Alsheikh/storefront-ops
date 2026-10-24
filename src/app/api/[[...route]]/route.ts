import { handle } from "hono/vercel";
import { app } from "@/server/app";

// Hono handles every /api request. It reads the request, so Next runs this
// handler per request; nothing here is prerendered or cached.
export const GET = handle(app);
export const POST = handle(app);
export const PATCH = handle(app);
