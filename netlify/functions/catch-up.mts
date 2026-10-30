import { createNeonDb } from "../../src/server/db/client";
import { catchUp } from "../../src/server/sim/catchUp";

/**
 * Writes simulated orders every six hours, even with no visitors. After a
 * quiet day a catch-up is thousands of writes on cold pages: long enough to
 * threaten the nightly reset's 30 seconds. Four wakes a day cost little of
 * Neon's compute allowance, because the database sleeps again after 5 minutes.
 */
const catchUpHandler = async () => {
  const url = process.env.DATABASE_URL;
  if (!url) return new Response("DATABASE_URL is not set", { status: 500 });
  const { db } = await createNeonDb(url);
  const result = await catchUp(db);
  console.log("[catch-up]", JSON.stringify(result));
  return Response.json(result);
};

export default catchUpHandler;

export const config = { schedule: "0 */6 * * *" };
