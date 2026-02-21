// src/lib/barista-service.ts
// ============================================================
// Barista-facing data access: fetch today's orders and update status.
// Called from the barista view page.
// ============================================================

import { createClient } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { OrderWithItems, OrderStatus } from "./types";

// Plain (non-generic) client for writes — avoids Supabase v2 generic
// resolution issues with hand-written Database types (same pattern as
// order-service.ts).
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * Fetch all orders (with items) created today (UTC midnight → now).
 * Ordered oldest-first so baristas work through the queue in order.
 */
export async function fetchAllOrders(): Promise<OrderWithItems[]> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items(*)")
    .gte("created_at", startOfToday.toISOString())
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[barista-service] fetchAllOrders error:", error);
    return [];
  }

  return (data as unknown as OrderWithItems[]) ?? [];
}

/**
 * Update an order's status in Supabase.
 * Errors are logged and not re-thrown — caller relies on optimistic UI.
 */
export async function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus
): Promise<void> {
  const { error } = await db
    .from("orders")
    .update({ status: newStatus })
    .eq("id", orderId);

  if (error) {
    console.error("[barista-service] updateOrderStatus error:", error);
  }
}
