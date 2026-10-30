import { createNeonDb } from "../../src/server/db/client";
import { resetDemo } from "../../src/server/sim/reset";

/**
 * Restores the demo every night: catches up, undoes visitor changes, trims
 * history. Netlify gives a scheduled function 30 seconds; `catch-up` keeps
 * the backlog short enough for this to fit.
 */
const resetDemoHandler = async () => {
  const url = process.env.DATABASE_URL;
  if (!url) return new Response("DATABASE_URL is not set", { status: 500 });
  const { db } = await createNeonDb(url);
  const report = await resetDemo(db);
  console.log("[reset-demo]", JSON.stringify({ ...report, ms: Math.round(report.ms) }));
  return Response.json(report);
};

export default resetDemoHandler;

export const config = { schedule: "@daily" };
