CREATE TABLE "daily_country_stats" (
	"day" date NOT NULL,
	"country" text NOT NULL,
	"orders" integer DEFAULT 0 NOT NULL,
	"revenue_cents" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "daily_country_stats_day_country_pk" PRIMARY KEY("day","country")
);
--> statement-breakpoint
CREATE TABLE "daily_status_stats" (
	"day" date NOT NULL,
	"status" text NOT NULL,
	"orders" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "daily_status_stats_day_status_pk" PRIMARY KEY("day","status")
);
--> statement-breakpoint
CREATE TABLE "daily_variant_stats" (
	"day" date NOT NULL,
	"variant_id" integer NOT NULL,
	"units" integer DEFAULT 0 NOT NULL,
	"revenue_cents" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "daily_variant_stats_day_variant_id_pk" PRIMARY KEY("day","variant_id")
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "orders_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "lifetime_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "last_order_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "search_text" text GENERATED ALWAYS AS (lower(name || ' ' || email)) STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_variant_stats" ADD CONSTRAINT "daily_variant_stats_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customers_lifetime_idx" ON "customers" USING btree ("lifetime_cents" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "customers_last_order_idx" ON "customers" USING btree ("last_order_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "customers_search_trgm_idx" ON "customers" USING gin ("search_text" gin_trgm_ops);