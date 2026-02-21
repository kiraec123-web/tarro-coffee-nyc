#!/usr/bin/env node
/**
 * scripts/export-csv.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Exports all Supabase orders to CSV files in the project root.
 *
 *   orders.csv          — one row per order, items as a readable summary string
 *   orders_detailed.csv — one row per order item (full structured data)
 *
 * Usage: npx tsx scripts/export-csv.ts
 */

import dotenv from "dotenv";
import path from "path";
import fs from "fs";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AddOnEntry {
  name: string;
  qty: number;
  unit_price: number;
}

interface OrderRow {
  id: string;
  order_number: number;
  customer_name: string | null;
  status: string;
  total_price: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface ItemRow {
  order_id: string;
  item_name: string;
  size: string;
  temp: string;
  milk: string | null;
  sweetness: string;
  ice_level: string;
  add_ons: AddOnEntry[];
  item_price: number;
  special_instructions: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PASTRY_NAMES = ["croissant", "cookie", "banana bread"];

function isPastry(name: string): boolean {
  const n = name.toLowerCase();
  return PASTRY_NAMES.some((p) => n.includes(p));
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** CSV-safe: wraps in quotes only if the value contains commas, quotes, or newlines. */
function esc(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Human-readable single-item summary for the orders.csv "items" column.
 * e.g. "Large Iced Latte (oat milk, +2 Caramel Syrup)"
 *      "Chocolate Croissant"
 */
function summariseItem(item: ItemRow): string {
  if (isPastry(item.item_name)) return item.item_name;

  const parts: string[] = [`${cap(item.size)} ${cap(item.temp)} ${item.item_name}`];
  if (item.milk) parts.push(`${item.milk} milk`);

  const addOns = (item.add_ons ?? []) as AddOnEntry[];
  for (const a of addOns) {
    parts.push(`+${a.qty} ${a.name}`);
  }

  return parts[0] + (parts.length > 1 ? ` (${parts.slice(1).join(", ")})` : "");
}

/**
 * Semicolon-separated add-ons for orders_detailed.csv.
 * e.g. "Extra Espresso Shot x2; Caramel Syrup x1"
 */
function formatAddOns(addOns: AddOnEntry[]): string {
  if (!addOns || addOns.length === 0) return "";
  return addOns.map((a) => `${a.name} x${a.qty}`).join("; ");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error(
      "❌  Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local"
    );
    process.exit(1);
  }

  const db = createClient(url, key);

  // ── Fetch orders ─────────────────────────────────────────────────────────
  const { data: orders, error: oe } = await db
    .from("orders")
    .select(
      "id, order_number, customer_name, status, total_price, created_at, started_at, completed_at"
    )
    .order("order_number", { ascending: true });

  if (oe || !orders) {
    console.error("Failed to fetch orders:", oe?.message);
    process.exit(1);
  }

  const orderRows = orders as OrderRow[];

  if (orderRows.length === 0) {
    console.log(
      "No orders found. Run the seed script first:\n" +
        "  npx tsx scripts/seed-orders.ts --clear"
    );
    process.exit(0);
  }

  // ── Fetch order items ─────────────────────────────────────────────────────
  const orderIds = orderRows.map((o) => o.id);

  const { data: items, error: ie } = await db
    .from("order_items")
    .select(
      "order_id, item_name, size, temp, milk, sweetness, ice_level, add_ons, item_price, special_instructions"
    )
    .in("order_id", orderIds);

  if (ie || !items) {
    console.error("Failed to fetch order items:", ie?.message);
    process.exit(1);
  }

  const itemRows = items as ItemRow[];

  // Group items by order_id for quick lookup
  const byOrder: Record<string, ItemRow[]> = {};
  for (const item of itemRows) {
    if (!byOrder[item.order_id]) byOrder[item.order_id] = [];
    byOrder[item.order_id].push(item);
  }

  // ── orders.csv (one row per order) ───────────────────────────────────────

  const orderHeaders = [
    "order_number",
    "customer_name",
    "status",
    "total_price",
    "created_at",
    "started_at",
    "completed_at",
    "items",
  ];

  const orderLines: string[] = [orderHeaders.join(",")];

  for (const order of orderRows) {
    const orderItems = byOrder[order.id] ?? [];
    const itemsSummary = esc(orderItems.map(summariseItem).join("; "));
    orderLines.push(
      [
        esc(order.order_number),
        esc(order.customer_name),
        esc(order.status),
        esc(order.total_price),
        esc(order.created_at),
        esc(order.started_at),
        esc(order.completed_at),
        itemsSummary,
      ].join(",")
    );
  }

  const csvPath = path.resolve(process.cwd(), "orders.csv");
  fs.writeFileSync(csvPath, orderLines.join("\n"), "utf-8");

  // ── orders_detailed.csv (one row per order item) ──────────────────────────

  const detHeaders = [
    "order_number",
    "customer_name",
    "order_status",
    "order_total",
    "order_created_at",
    "item_name",
    "size",
    "temp",
    "milk",
    "sweetness",
    "ice_level",
    "add_ons",
    "item_price",
    "special_instructions",
  ];

  const detLines: string[] = [detHeaders.join(",")];

  for (const order of orderRows) {
    const orderItems = byOrder[order.id] ?? [];
    for (const item of orderItems) {
      detLines.push(
        [
          esc(order.order_number),
          esc(order.customer_name),
          esc(order.status),
          esc(order.total_price),
          esc(order.created_at),
          esc(item.item_name),
          esc(item.size),
          esc(item.temp),
          esc(item.milk),
          esc(item.sweetness),
          esc(item.ice_level),
          esc(formatAddOns((item.add_ons ?? []) as AddOnEntry[])),
          esc(item.item_price),
          esc(item.special_instructions),
        ].join(",")
      );
    }
  }

  const detPath = path.resolve(process.cwd(), "orders_detailed.csv");
  fs.writeFileSync(detPath, detLines.join("\n"), "utf-8");

  console.log(`Exported ${orderRows.length} orders to orders.csv`);
  console.log(
    `Exported ${itemRows.length} item rows to orders_detailed.csv`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
