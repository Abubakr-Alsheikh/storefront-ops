CREATE TABLE "customers" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"country" text NOT NULL,
	"city" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "customers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "daily_stats" (
	"day" date PRIMARY KEY NOT NULL,
	"orders" integer DEFAULT 0 NOT NULL,
	"revenue_cents" integer DEFAULT 0 NOT NULL,
	"sessions" integer DEFAULT 0 NOT NULL,
	"units" integer DEFAULT 0 NOT NULL,
	"new_customers" integer DEFAULT 0 NOT NULL,
	"refunds_cents" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "order_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"order_id" integer NOT NULL,
	"type" text NOT NULL,
	"message" text,
	"actor" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "order_events_type_check" CHECK (type IN ('placed', 'paid', 'packed', 'shipped', 'delivered', 'cancelled', 'refunded', 'note')),
	CONSTRAINT "order_events_actor_check" CHECK (actor IN ('system', 'visitor'))
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "order_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"order_id" integer NOT NULL,
	"variant_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_cents" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "orders_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 100001 CACHE 1),
	"sim_key" text NOT NULL,
	"customer_id" integer NOT NULL,
	"customer_name" text NOT NULL,
	"customer_email" text NOT NULL,
	"country" text NOT NULL,
	"city" text NOT NULL,
	"status" text NOT NULL,
	"payment_method" text NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"discount_cents" integer NOT NULL,
	"discount_code" text,
	"shipping_cents" integer NOT NULL,
	"tax_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"item_count" integer NOT NULL,
	"is_returning" boolean NOT NULL,
	"placed_at" timestamp with time zone NOT NULL,
	"plan_paid_at" timestamp with time zone NOT NULL,
	"plan_packed_at" timestamp with time zone,
	"plan_shipped_at" timestamp with time zone,
	"plan_delivered_at" timestamp with time zone,
	"plan_cancelled_at" timestamp with time zone,
	"plan_refunded_at" timestamp with time zone,
	"plan_outcome" text NOT NULL,
	"visitor_touched_at" timestamp with time zone,
	"search_text" text GENERATED ALWAYS AS (lower(id::text || ' ' || customer_name || ' ' || customer_email)) STORED NOT NULL,
	CONSTRAINT "orders_sim_key_unique" UNIQUE("sim_key"),
	CONSTRAINT "orders_status_check" CHECK (status IN ('paid', 'packed', 'shipped', 'delivered', 'cancelled', 'refunded')),
	CONSTRAINT "orders_payment_check" CHECK (payment_method IN ('card', 'paypal', 'mbway', 'klarna', 'apple_pay')),
	CONSTRAINT "orders_outcome_check" CHECK (plan_outcome IN ('complete', 'cancelled', 'refunded'))
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" integer PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"collection" text NOT NULL,
	"type" text NOT NULL,
	"image_slot" text NOT NULL,
	CONSTRAINT "products_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "restock_runs" (
	"week" integer PRIMARY KEY NOT NULL,
	"ran_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sim_state" (
	"id" integer PRIMARY KEY NOT NULL,
	"sim_version" integer NOT NULL,
	"materialised_until" timestamp with time zone NOT NULL,
	CONSTRAINT "sim_state_singleton" CHECK ("sim_state"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "stock_adjustments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stock_adjustments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"variant_id" integer NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"actor" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "stock_adjustments_reason_check" CHECK (reason IN ('restock', 'correction')),
	CONSTRAINT "stock_adjustments_actor_check" CHECK (actor IN ('system', 'visitor'))
);
--> statement-breakpoint
CREATE TABLE "variants" (
	"id" integer PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"sku" text NOT NULL,
	"option_label" text NOT NULL,
	"price_cents" integer NOT NULL,
	"weight_grams" integer NOT NULL,
	"lead_time_days" integer NOT NULL,
	"opening_stock" integer NOT NULL,
	"units_sold" integer DEFAULT 0 NOT NULL,
	"stock_on_hand" integer NOT NULL,
	"reorder_point" integer NOT NULL,
	CONSTRAINT "variants_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variants" ADD CONSTRAINT "variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_events_order_idx" ON "order_events" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_variant_idx" ON "order_items" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "orders_placed_idx" ON "orders" USING btree ("placed_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "orders_status_placed_idx" ON "orders" USING btree ("status","placed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "orders_customer_placed_idx" ON "orders" USING btree ("customer_id","placed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "orders_country_idx" ON "orders" USING btree ("country");--> statement-breakpoint
CREATE INDEX "orders_search_trgm_idx" ON "orders" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "orders_open_idx" ON "orders" USING btree ("status") WHERE status IN ('paid', 'packed', 'shipped');--> statement-breakpoint
CREATE INDEX "orders_refund_due_idx" ON "orders" USING btree ("plan_refunded_at") WHERE status = 'delivered' AND plan_refunded_at IS NOT NULL;--> statement-breakpoint
CREATE INDEX "orders_visitor_touched_idx" ON "orders" USING btree ("visitor_touched_at") WHERE visitor_touched_at IS NOT NULL;--> statement-breakpoint
CREATE INDEX "stock_adjustments_variant_idx" ON "stock_adjustments" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "variants_product_idx" ON "variants" USING btree ("product_id");