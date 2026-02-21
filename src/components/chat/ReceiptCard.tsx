"use client";

// src/components/chat/ReceiptCard.tsx
// ============================================================
// Paper-receipt styled order card.
// - Plays a confirmation chime on first mount
// - Subscribes to Supabase realtime for live order status
// - Shows "Modify order" link while status is still "new"
// ============================================================

import { useEffect, useState } from "react";
import { RotateCcw, Clock, Flame, CheckCircle } from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import type { OrderReceipt, ReceiptItem } from "@/lib/order-service";
import { playOrderSound } from "@/lib/sounds";

// Lightweight Supabase client for realtime subscription
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ── Types ────────────────────────────────────────────────────────────────────

type OrderStatus = "new" | "in_progress" | "completed";

interface ReceiptCardProps {
  receipt: OrderReceipt;
  orderNumber: number;
  /** Supabase order UUID — used for realtime status updates and modify link */
  orderId?: string;
  onNewOrder: () => void;
  /**
   * Called when the customer taps "Modify order".
   * Only rendered when status is "new" and orderId is set.
   */
  onModifyOrder?: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function itemLabel(item: ReceiptItem): string {
  const size = item.size === "large" ? "Lg" : "Sm";
  const temp = item.temp === "iced" ? " Iced" : "";
  return `${size}${temp} ${item.item_name}`;
}

function itemMods(item: ReceiptItem): string {
  const parts: string[] = [];
  if (item.milk && item.milk !== "whole") parts.push(`${item.milk} milk`);
  if (item.sweetness && item.sweetness !== "regular") parts.push(item.sweetness);
  if (item.ice_level && item.ice_level !== "regular" && item.temp === "iced") {
    parts.push(`${item.ice_level} ice`);
  }
  item.add_ons.forEach((a) => parts.push(`+${a.name}`));
  if (item.special_instructions) parts.push(item.special_instructions);
  return parts.join(", ");
}

const DASHES = "- - - - - - - - - - - - - - - - - - - - - - -";

// ── Status config ─────────────────────────────────────────────────────────────

interface StatusConfig {
  label: string;
  colorClass: string;
  Icon: React.FC<{ className?: string }>;
}

const STATUS_CONFIG: Record<OrderStatus, StatusConfig> = {
  new: {
    label: "Order placed",
    colorClass: "text-amber-700",
    Icon: ({ className }) => <Clock className={className} />,
  },
  in_progress: {
    label: "Being prepared…",
    colorClass: "text-orange-600",
    Icon: ({ className }) => <Flame className={`${className ?? ""} animate-pulse`} />,
  },
  completed: {
    label: "Ready for pickup!",
    colorClass: "text-emerald-600",
    Icon: ({ className }) => <CheckCircle className={className} />,
  },
};

// ── Component ─────────────────────────────────────────────────────────────────

export function ReceiptCard({
  receipt,
  orderNumber,
  orderId,
  onNewOrder,
  onModifyOrder,
}: ReceiptCardProps) {
  const [status, setStatus] = useState<OrderStatus>("new");

  // Play confirmation chime once on mount
  useEffect(() => {
    playOrderSound();
  }, []);

  // Subscribe to realtime status updates for this order
  useEffect(() => {
    if (!orderId) return;

    const channel = db
      .channel(`order-status-${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          const next = (payload.new as { status?: string })?.status;
          if (next === "new" || next === "in_progress" || next === "completed") {
            setStatus(next);
          }
        }
      )
      .subscribe();

    return () => {
      db.removeChannel(channel);
    };
  }, [orderId]);

  const { label, colorClass, Icon } = STATUS_CONFIG[status];
  const orderNum =
    orderNumber > 0 ? String(orderNumber).padStart(3, "0") : "---";

  return (
    <div
      className="animate-receipt-in max-w-[85%] rounded-2xl overflow-hidden shadow-md border border-stone-100"
      style={{ backgroundColor: "#FFFDF7" }}
    >
      {/* ── Status strip ─────────────────────────────────────────────────── */}
      <div
        className={`flex items-center gap-2 px-4 py-2.5 ${colorClass}`}
        style={{ borderBottom: "1px dashed #D9CFC4" }}
      >
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="text-[11px] font-semibold tracking-widest uppercase">
          {label}
        </span>

        {/* Modify order link — only visible when the order hasn't started yet */}
        {status === "new" && onModifyOrder && (
          <button
            type="button"
            onClick={onModifyOrder}
            className="ml-auto text-sm underline"
            style={{ color: "#2C1A12", opacity: 0.6 }}
          >
            Modify order
          </button>
        )}
      </div>

      {/* ── Paper receipt body ────────────────────────────────────────────── */}
      <div className="px-5 py-4 font-mono" style={{ color: "#2C1A12" }}>
        {/* Shop header */}
        <div className="text-center mb-3">
          <p className="text-[13px] font-bold tracking-widest uppercase">
            NYC Coffee
          </p>
          <p
            className="text-[10px] tracking-wide mt-0.5"
            style={{ color: "#9A8A7A" }}
          >
            512 West 43rd Street · NYC
          </p>
        </div>

        <p
          className="text-[9px] tracking-widest text-center mb-3 overflow-hidden"
          style={{ color: "#C9B9A9" }}
        >
          {DASHES}
        </p>

        {/* Order number — large and centred so customers can spot it instantly */}
        <div className="text-center mb-2">
          <p className="text-2xl font-bold tracking-wider">#{orderNum}</p>
          {receipt.customer_name && (
            <p
              className="text-[11px] mt-0.5"
              style={{ color: "#9A8A7A" }}
            >
              For {receipt.customer_name}
            </p>
          )}
        </div>

        <p
          className="text-[9px] tracking-widest text-center my-3 overflow-hidden"
          style={{ color: "#C9B9A9" }}
        >
          {DASHES}
        </p>

        {/* Items */}
        <div className="space-y-2.5 mb-3">
          {receipt.items.map((item, i) => {
            const mods = itemMods(item);
            return (
              <div key={i}>
                <div className="flex justify-between items-baseline gap-2">
                  <span className="text-[12px] font-semibold leading-snug">
                    {itemLabel(item)}
                  </span>
                  <span className="text-[12px] shrink-0">
                    ${item.item_price.toFixed(2)}
                  </span>
                </div>
                {mods && (
                  <p
                    className="text-[10px] mt-0.5 leading-snug"
                    style={{ color: "#9A8A7A" }}
                  >
                    {mods}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <p
          className="text-[9px] tracking-widest text-center mb-3 overflow-hidden"
          style={{ color: "#C9B9A9" }}
        >
          {DASHES}
        </p>

        {/* Total */}
        <div className="flex justify-between items-baseline mb-4">
          <span className="text-[12px] font-bold tracking-wider uppercase">
            Total
          </span>
          <span className="text-[16px] font-bold">
            ${receipt.total_price.toFixed(2)}
          </span>
        </div>

        {/* Pickup info */}
        <p
          className="text-[10px] text-center leading-relaxed mb-1"
          style={{ color: "#9A8A7A" }}
        >
          Ready in ~3–5 min
          <br />
          Pay at the counter when you pick up
        </p>

        <p
          className="text-[9px] tracking-widest text-center mt-3 mb-4 overflow-hidden"
          style={{ color: "#C9B9A9" }}
        >
          {DASHES}
        </p>

        {/* Start New Order */}
        <button
          type="button"
          onClick={onNewOrder}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-full border text-[12px] font-semibold tracking-wide transition-opacity active:opacity-70"
          style={{ borderColor: "#2C1A12", color: "#2C1A12" }}
        >
          <RotateCcw className="w-3 h-3" />
          Start New Order
        </button>
      </div>
    </div>
  );
}
