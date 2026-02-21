// src/lib/order-service.ts
// ============================================================
// Saves and updates orders in Supabase.
// Called client-side after the AI outputs a receipt JSON block.
//
// Uses a plain (non-generic) Supabase client so we aren't
// fighting the v2 internal generic resolution for hand-written
// Database types. Explicit TypeScript casts provide type safety.
// ============================================================

import { createClient } from "@supabase/supabase-js";
import type { Order, OrderItem, OrderWithItems } from "./types";

// Plain client — no Database generic param needed here
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ---- Receipt types (shape the AI emits) ----

export interface ReceiptAddOn {
  name: string;
  qty: number;
  price: number; // per-unit price from AI receipt
}

export interface ReceiptItem {
  item_name: string;
  size: string;
  temp: string;
  milk: string | null;
  sweetness: string;
  ice_level: string;
  add_ons: ReceiptAddOn[];
  item_price: number;
  special_instructions: string | null;
}

export interface OrderReceipt {
  /** "order_complete" = new order; "order_update" = modifying an existing order */
  type: "order_complete" | "order_update";
  customer_name?: string | null;
  items: ReceiptItem[];
  total_price: number;
}

// ---- Helper: map receipt items → DB row shape ----

function toItemRows(orderId: string, items: ReceiptItem[]) {
  return items.map((item) => ({
    order_id: orderId,
    item_name: item.item_name,
    size: item.size,
    temp: item.temp,
    milk: item.milk,
    sweetness: item.sweetness,
    ice_level: item.ice_level,
    // Map receipt shape (price) → DB shape (unit_price)
    add_ons: item.add_ons.map((a) => ({
      name: a.name,
      qty: a.qty,
      unit_price: a.price,
    })),
    item_price: item.item_price,
    special_instructions: item.special_instructions,
  }));
}

// ---- Save new order ----

export async function saveOrder(receipt: OrderReceipt): Promise<OrderWithItems> {
  // ---- Generate next order number ----
  const { data: latestRaw } = await db
    .from("orders")
    .select("order_number")
    .order("order_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const latest = latestRaw as { order_number: number } | null;
  const orderNumber = (latest?.order_number ?? 0) + 1;

  // ---- Insert order row ----
  const { data: orderRaw, error: orderError } = await db
    .from("orders")
    .insert({
      order_number: orderNumber,
      customer_name: receipt.customer_name ?? null,
      status: "new",
      total_price: receipt.total_price,
    })
    .select()
    .single();

  if (orderError || !orderRaw) {
    throw new Error(
      `Failed to create order: ${orderError?.message ?? "unknown error"}`
    );
  }

  const order = orderRaw as Order;

  // ---- Insert order_items rows ----
  const itemRows = toItemRows(order.id, receipt.items);

  const { data: itemsRaw, error: itemsError } = await db
    .from("order_items")
    .insert(itemRows)
    .select();

  if (itemsError || !itemsRaw) {
    throw new Error(
      `Failed to create order items: ${itemsError?.message ?? "unknown error"}`
    );
  }

  const orderItems = itemsRaw as OrderItem[];

  return { ...order, order_items: orderItems };
}

// ---- Update existing order ----
//
// Called when the AI outputs type:"order_update". Replaces the order's
// total_price and fully replaces all order_items (delete + re-insert).
// The order_number and id remain the same — no duplicate is created.

export async function updateOrder(
  orderId: string,
  items: ReceiptItem[],
  newTotal: number
): Promise<void> {
  // 1. Update the order total
  const { error: updateError } = await db
    .from("orders")
    .update({ total_price: newTotal })
    .eq("id", orderId);

  if (updateError) {
    throw new Error(`Failed to update order: ${updateError.message}`);
  }

  // 2. Delete all existing order_items for this order
  const { error: deleteError } = await db
    .from("order_items")
    .delete()
    .eq("order_id", orderId);

  if (deleteError) {
    throw new Error(`Failed to delete order items: ${deleteError.message}`);
  }

  // 3. Insert the updated items
  const itemRows = toItemRows(orderId, items);

  const { error: insertError } = await db
    .from("order_items")
    .insert(itemRows);

  if (insertError) {
    throw new Error(`Failed to insert updated items: ${insertError.message}`);
  }
}
