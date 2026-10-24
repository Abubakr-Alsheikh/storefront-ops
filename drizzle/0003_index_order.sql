DROP INDEX "customers_lifetime_idx";--> statement-breakpoint
DROP INDEX "customers_last_order_idx";--> statement-breakpoint
DROP INDEX "orders_placed_idx";--> statement-breakpoint
DROP INDEX "orders_status_placed_idx";--> statement-breakpoint
DROP INDEX "orders_customer_placed_idx";--> statement-breakpoint
ALTER TABLE "sim_state" ADD COLUMN "orders_total" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "customers_lifetime_idx" ON "customers" USING btree ("lifetime_cents","id");--> statement-breakpoint
CREATE INDEX "customers_last_order_idx" ON "customers" USING btree ("last_order_at","id");--> statement-breakpoint
CREATE INDEX "orders_placed_idx" ON "orders" USING btree ("placed_at","id");--> statement-breakpoint
CREATE INDEX "orders_status_placed_idx" ON "orders" USING btree ("status","placed_at","id");--> statement-breakpoint
CREATE INDEX "orders_customer_placed_idx" ON "orders" USING btree ("customer_id","placed_at","id");--> statement-breakpoint
-- Backfill the counter for databases seeded before it existed.
UPDATE "sim_state" SET "orders_total" = (SELECT count(*) FROM "orders");
