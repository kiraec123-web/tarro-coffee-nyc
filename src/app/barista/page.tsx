"use client";

// src/app/barista/page.tsx
// ============================================================
// Barista Queue — Kanban-style order management view.
// Desktop: 3 side-by-side columns. Mobile: horizontal tabs.
// Real-time updates via Supabase postgres_changes subscriptions.
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";
import { Coffee, Clock, Flame, CheckCircle } from "lucide-react";
import { NavLinks } from "@/components/NavLinks";
import { supabase } from "@/lib/supabase";
import { fetchAllOrders, updateOrderStatus } from "@/lib/barista-service";
import { PASTRIES } from "@/lib/menu";
import type { Order, OrderItem, OrderWithItems, OrderStatus } from "@/lib/types";

// ── Pastry name set ───────────────────────────────────────────────────────────

const PASTRY_NAMES = new Set(PASTRIES.map((p) => p.name));

// ── Notification sound ────────────────────────────────────────────────────────
// Three short ascending tones (440→660→880 Hz) — distinct from the customer's
// descending order-placed chime (880→660 Hz).

function playNewOrderSound(): void {
  try {
    const ctx = new AudioContext();
    [440, 660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      const t = ctx.currentTime + i * 0.13;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.12, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.start(t);
      osc.stop(t + 0.15);
    });
    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch {
    // silently fail — autoplay blocked or API unavailable
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin === 1) return "1 min ago";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  return diffHr === 1 ? "1 hr ago" : `${diffHr} hrs ago`;
}

// Bug 4 fix: colour-code time only on "new" orders, muted for all others.
function getTimeStyle(isoString: string, status: OrderStatus): React.CSSProperties {
  if (status !== "new") return { color: "#9A8A7A" };
  const diffMin = (Date.now() - new Date(isoString).getTime()) / 60000;
  if (diffMin < 5) return { color: "#16A34A" };  // green  — fresh
  if (diffMin < 10) return { color: "#D97706" }; // amber  — getting old
  return { color: "#DC2626" };                   // red    — urgent
}

function formatOrderNumber(n: number): string {
  return `#${String(n).padStart(3, "0")}`;
}

/** Capitalise first letter of a string. */
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Group identical order items so the barista sees "6x Banana Bread" instead
 * of six separate lines. Two items are identical when every customer-facing
 * field matches: name, size, temp, milk, sweetness, ice_level, add_ons, and
 * special_instructions. The first occurrence is used as the representative.
 */
function groupItems(items: OrderItem[]): { item: OrderItem; qty: number; key: string }[] {
  const groups = new Map<string, { item: OrderItem; qty: number; key: string }>();
  for (const item of items) {
    // Sort add_ons by name before serialising so order differences don't break grouping.
    const addOnsKey = JSON.stringify(
      [...(item.add_ons ?? [])].sort((a, b) => a.name.localeCompare(b.name))
    );
    const key = [
      item.item_name,
      item.size,
      item.temp,
      item.milk ?? "",
      item.sweetness,
      item.ice_level,
      addOnsKey,
      item.special_instructions ?? "",
    ].join("\0");

    const existing = groups.get(key);
    if (existing) {
      existing.qty += 1;
    } else {
      groups.set(key, { item, qty: 1, key });
    }
  }
  return Array.from(groups.values());
}

// Bug 1 fix: don't prepend temp if the drink name already contains a
// temperature word (e.g. "Iced Latte", "Cold Brew", "Coffee Frappuccino").
function buildItemLabel(item: OrderItem, isPastry: boolean): string {
  if (isPastry) return item.item_name;
  const lower = item.item_name.toLowerCase();
  const tempEmbedded =
    lower.includes("iced") ||
    lower.includes("hot") ||
    lower.includes("cold") ||
    lower.includes("frapp") ||
    lower.includes("blend");
  const tempPrefix = tempEmbedded ? "" : `${cap(item.temp)} `;
  return `${cap(item.size)} ${tempPrefix}${item.item_name}`;
}

// ── OrderCard ─────────────────────────────────────────────────────────────────

interface OrderCardProps {
  order: OrderWithItems;
  isNew: boolean;
  onStatusChange: (id: string, status: OrderStatus) => void;
}

function OrderCard({ order, isNew, onStatusChange }: OrderCardProps) {
  // Live relative-time + urgency-level updates every 30 s (Enhancement 3).
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  // Double-tap Complete guard.
  const [confirming, setConfirming] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    };
  }, []);

  function handleComplete() {
    if (!confirming) {
      setConfirming(true);
      confirmTimer.current = setTimeout(() => setConfirming(false), 3000);
    } else {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      setConfirming(false);
      onStatusChange(order.id, "completed");
    }
  }

  const isCompleted = order.status === "completed";
  const isInProgress = order.status === "in_progress";

  // Enhancement 1: urgency level for aging "New" orders.
  // Recomputed on every 30 s tick so the glow class switches automatically.
  const ageMin =
    order.status === "new"
      ? (Date.now() - new Date(order.created_at).getTime()) / 60_000
      : 0;
  const urgencyLevel: 0 | 1 | 2 = ageMin >= 10 ? 2 : ageMin >= 5 ? 1 : 0;

  // Border colour shifts to red when urgency is critical.
  const borderColor =
    isCompleted ? "#22C55E" : urgencyLevel === 2 ? "#DC2626" : "#D4943A";

  // Shadow class: base shadow when calm, amber/red glow when urgent.
  // box-shadow is intentionally NOT set inline so the CSS class owns it.
  const shadowClass =
    urgencyLevel === 2
      ? "card-glow-red"
      : urgencyLevel === 1
      ? "card-glow-amber"
      : "card-shadow";

  return (
    <div
      // min-w-0 prevents content from overflowing the grid cell (Bug 3 fix).
      // shadowClass controls box-shadow via CSS — no inline boxShadow needed.
      className={`relative min-w-0 bg-white rounded-xl overflow-hidden ${shadowClass} ${
        isNew ? "animate-card-in" : ""
      } ${isCompleted ? "opacity-55" : ""}`}
      style={{
        borderLeft: `4px solid ${borderColor}`,
      }}
    >
      {/* Pulsing overlay on left border for in-progress */}
      {isInProgress && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-0 bottom-0 animate-pulse"
          style={{ width: 4, backgroundColor: borderColor }}
        />
      )}

      <div className="p-4">
        {/* ── Order number + relative time ────────────────────────────── */}
        <div className="flex items-start justify-between gap-2 mb-1">
          <span
            className="text-[26px] font-bold leading-none tracking-tight shrink-0"
            style={{ color: "#2C1A12" }}
          >
            {formatOrderNumber(order.order_number)}
          </span>
          {/* Bug 2 fix: toFixed(2) everywhere; Bug 4 fix: status-aware colour */}
          <span
            className="text-sm font-medium mt-1 text-right"
            style={getTimeStyle(order.created_at, order.status)}
          >
            {formatRelativeTime(order.created_at)}
          </span>
        </div>

        {/* Customer name */}
        {order.customer_name && (
          <p
            className="text-sm font-medium mb-3"
            style={{ color: "#6B4E3D" }}
          >
            {order.customer_name}
          </p>
        )}

        {/* ── Item list ────────────────────────────────────────────────── */}
        <div className="space-y-3 mb-3">
          {groupItems(order.order_items).map(({ item, qty, key }) => {
            const isPastry = PASTRY_NAMES.has(item.item_name);
            const label = buildItemLabel(item, isPastry);

            // Non-whole milk: show prominently in amber uppercase.
            // Whole milk is the default — don't show it.
            const highlightMilk =
              !isPastry && item.milk && item.milk !== "whole"
                ? item.milk.toUpperCase() + " MILK"
                : null;

            // Secondary mods — only show non-default values.
            const otherMods: string[] = [];
            if (!isPastry) {
              if (item.sweetness && item.sweetness !== "regular")
                otherMods.push(item.sweetness);
              if (
                item.temp === "iced" &&
                item.ice_level &&
                item.ice_level !== "regular"
              )
                otherMods.push(item.ice_level);
              item.add_ons?.forEach((a) =>
                otherMods.push(`+${a.qty} ${a.name}`)
              );
            }

            return (
              <div key={key}>
                {/* Item name line — qty > 1 when identical rows are consolidated */}
                <p
                  className="text-[15px] font-semibold leading-snug"
                  style={{ color: "#2C1A12" }}
                >
                  {qty}x {label}
                </p>

                {/* Milk — visually prominent, amber, uppercase, bold */}
                {highlightMilk && (
                  <p
                    className="ml-4 mt-0.5 text-[13px] font-bold tracking-wide"
                    style={{ color: "#D4943A" }}
                  >
                    {highlightMilk}
                  </p>
                )}

                {/* Other mods — sweetness, ice, add-ons */}
                {otherMods.length > 0 && (
                  <p
                    className="ml-4 mt-0.5 text-sm leading-snug"
                    style={{ color: "#9A8A7A" }}
                  >
                    {otherMods.join(", ")}
                  </p>
                )}

                {/* Special instructions — italic */}
                {!isPastry && item.special_instructions && (
                  <p
                    className="ml-4 mt-0.5 text-sm italic leading-snug"
                    style={{ color: "#9A8A7A" }}
                  >
                    {item.special_instructions}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Total ───────────────────────────────────────────────────── */}
        {/* Bug 2 fix: .toFixed(2) ensures "$5.00" not "$5.0" */}
        <div
          className="flex items-center justify-between pt-2.5 mb-3"
          style={{ borderTop: "1px solid rgba(44,26,18,0.08)" }}
        >
          <span className="text-sm" style={{ color: "#9A8A7A" }}>
            Total
          </span>
          <span
            className="text-base font-bold"
            style={{ color: "#2C1A12" }}
          >
            ${order.total_price.toFixed(2)}
          </span>
        </div>

        {/* ── Action buttons ───────────────────────────────────────────── */}
        {order.status === "new" && (
          <button
            type="button"
            onClick={() => onStatusChange(order.id, "in_progress")}
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ backgroundColor: "#D4943A" }}
          >
            Start
          </button>
        )}

        {order.status === "in_progress" && (
          <button
            type="button"
            onClick={handleComplete}
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98]"
            style={{
              backgroundColor: confirming ? "#6B7280" : "#22C55E",
            }}
          >
            {confirming ? "Tap again to confirm" : "Complete"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Column config ─────────────────────────────────────────────────────────────

interface ColumnConfig {
  status: OrderStatus;
  label: string;
  icon: React.ReactNode;
  emptyMessage: string;
  accentColor: string;
  badgeBg: string;
  badgeText: string;
}

const COLUMNS: ColumnConfig[] = [
  {
    status: "new",
    label: "New",
    icon: <Clock className="w-4 h-4" />,
    emptyMessage: "No new orders",
    accentColor: "#D4943A",
    badgeBg: "#FEF3C7",
    badgeText: "#92400E",
  },
  {
    status: "in_progress",
    label: "In Progress",
    icon: <Flame className="w-4 h-4" />,
    emptyMessage: "Nothing in progress",
    accentColor: "#D4943A",
    badgeBg: "#FEF3C7",
    badgeText: "#92400E",
  },
  {
    status: "completed",
    label: "Completed",
    icon: <CheckCircle className="w-4 h-4" />,
    emptyMessage: "No completed orders yet",
    accentColor: "#22C55E",
    badgeBg: "#DCFCE7",
    badgeText: "#166534",
  },
];

// ── Desktop column ────────────────────────────────────────────────────────────

interface OrderColumnProps {
  config: ColumnConfig;
  orders: OrderWithItems[];
  newOrderIds: Set<string>;
  onStatusChange: (id: string, status: OrderStatus) => void;
}

function OrderColumn({
  config,
  orders,
  newOrderIds,
  onStatusChange,
}: OrderColumnProps) {
  return (
    // Bug 3 fix: min-w-0 on the column wrapper prevents grid-cell overflow.
    <div className="flex flex-col min-h-0 min-w-0">
      {/* Column header */}
      <div className="flex items-center gap-2 px-1 mb-3 shrink-0">
        <span style={{ color: config.accentColor }}>{config.icon}</span>
        <span
          className="text-base font-semibold"
          style={{ color: "#2C1A12" }}
        >
          {config.label}
        </span>
        <span
          className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
          style={
            orders.length > 0
              ? { backgroundColor: config.badgeBg, color: config.badgeText }
              : {
                  backgroundColor: "rgba(44,26,18,0.07)",
                  color: "#9A8A7A",
                }
          }
        >
          {orders.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-3 pb-4">
        {orders.length === 0 ? (
          <p
            className="text-sm text-center py-10"
            style={{ color: "#9A8A7A" }}
          >
            {config.emptyMessage}
          </p>
        ) : (
          orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              isNew={newOrderIds.has(order.id)}
              onStatusChange={onStatusChange}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── BaristaPage ───────────────────────────────────────────────────────────────

export default function BaristaPage() {
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<OrderStatus>("new");
  const [loading, setLoading] = useState(true);

  // Remove entrance-animation flag after the animation completes.
  const clearNewId = useCallback((id: string) => {
    setTimeout(() => {
      setNewOrderIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 1500);
  }, []);

  // ── Initial load ──────────────────────────────────────────────────────────

  useEffect(() => {
    fetchAllOrders().then((data) => {
      setOrders(data);
      setLoading(false);
    });
  }, []);

  // ── Status change (optimistic) ────────────────────────────────────────────

  const handleStatusChange = useCallback(
    async (orderId: string, newStatus: OrderStatus) => {
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId ? { ...o, status: newStatus } : o
        )
      );
      await updateOrderStatus(orderId, newStatus);
    },
    []
  );

  // ── Realtime subscription ─────────────────────────────────────────────────

  useEffect(() => {
    const channel = supabase
      .channel("barista-orders")
      // New order placed by a customer
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        async (payload) => {
          const orderId = (payload.new as Order).id;
          if (!orderId) return;

          // Wait 700 ms so all order_items rows are committed before we
          // fetch the joined record.
          setTimeout(async () => {
            const { data } = await supabase
              .from("orders")
              .select("*, order_items(*)")
              .eq("id", orderId)
              .single();

            if (!data) return;

            const incoming = data as unknown as OrderWithItems;

            setOrders((prev) => {
              const exists = prev.find((o) => o.id === orderId);
              const next = exists
                ? prev.map((o) => (o.id === orderId ? incoming : o))
                : [...prev, incoming];
              return next.sort(
                (a, b) =>
                  new Date(a.created_at).getTime() -
                  new Date(b.created_at).getTime()
              );
            });

            setNewOrderIds((prev) => new Set(prev).add(orderId));
            clearNewId(orderId);
            playNewOrderSound();
          }, 700);
        }
      )
      // Status/total_price update (from barista action or customer modification)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload) => {
          const updated = payload.new as Order;
          if (!updated?.id) return;
          setOrders((prev) =>
            prev.map((o) =>
              o.id === updated.id
                ? {
                    ...o,
                    status: updated.status,
                    total_price: updated.total_price,
                  }
                : o
            )
          );
        }
      )
      // New item rows — guards against the rare race where items arrive after
      // the 700 ms order fetch window.
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "order_items" },
        (payload) => {
          const item = payload.new as OrderItem;
          if (!item?.order_id) return;
          setOrders((prev) =>
            prev.map((o) => {
              if (o.id !== item.order_id) return o;
              if (o.order_items.find((i) => i.id === item.id)) return o; // dedup
              return { ...o, order_items: [...o.order_items, item] };
            })
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clearNewId]);

  // ── Grouped + sorted ─────────────────────────────────────────────────────
  // New + In Progress: oldest first (most urgent on top).
  // Completed: newest first (most recently finished on top).

  const byAge = (a: OrderWithItems, b: OrderWithItems) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  const byNewest = (a: OrderWithItems, b: OrderWithItems) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

  const grouped = {
    new: orders.filter((o) => o.status === "new").sort(byAge),
    in_progress: orders.filter((o) => o.status === "in_progress").sort(byAge),
    completed: orders.filter((o) => o.status === "completed").sort(byNewest),
  };

  // Enhancement 2: summary bar — total revenue and per-status counts.
  // Both update automatically whenever `orders` state changes (realtime).
  const totalRevenue = orders.reduce((sum, o) => sum + o.total_price, 0);
  const orderWord = orders.length === 1 ? "order" : "orders";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col h-[100dvh] overflow-hidden"
      style={{ backgroundColor: "#FAF7F2" }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header
        className="shrink-0 flex items-center justify-between px-4 py-3"
        style={{
          backgroundColor: "#1C1210",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Coffee className="w-5 h-5" style={{ color: "#D4943A" }} />
            <span
              className="font-serif-display text-xl leading-none"
              style={{ color: "#FAF3E8" }}
            >
              NYC Coffee
            </span>
          </div>
          <NavLinks />
        </div>

        <span
          className="text-sm font-medium"
          style={{ color: "#FAF3E8", opacity: 0.7 }}
        >
          Barista Queue
        </span>
      </header>

      {/* ── Summary bar (Enhancement 2) ───────────────────────────────────
          Slim info strip below the header. Updates live as orders arrive
          or change status — no extra polling needed, driven by `orders` state. */}
      {!loading && (
        <div
          className="shrink-0 px-4 py-1.5 text-center"
          style={{
            backgroundColor: "#1C1210",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <p className="text-xs" style={{ color: "#FAF3E8", opacity: 0.55 }}>
            {orders.length} {orderWord} today
            {" \u2014 "}
            {grouped.new.length} new,{" "}
            {grouped.in_progress.length} in progress,{" "}
            {grouped.completed.length} completed
            {" \u2014 "}
            ${totalRevenue.toFixed(2)} revenue
          </p>
        </div>
      )}

      {/* ── Loading ──────────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm" style={{ color: "#9A8A7A" }}>
            Loading orders…
          </p>
        </div>
      )}

      {/* ── All-empty state ───────────────────────────────────────────────── */}
      {!loading && orders.length === 0 && (
        <div className="flex-1 flex items-center justify-center px-8 text-center">
          <div>
            <p
              className="text-lg font-semibold mb-1.5"
              style={{ color: "#2C1A12" }}
            >
              No orders today yet.
            </p>
            <p className="text-sm" style={{ color: "#9A8A7A" }}>
              Orders will appear here in real-time.
            </p>
          </div>
        </div>
      )}

      {/* ── Kanban board (shown once there is at least one order) ────────── */}
      {!loading && orders.length > 0 && (
        <>
          {/* ─ Mobile: tab bar ─────────────────────────────────────────── */}
          <div
            className="md:hidden shrink-0 flex overflow-x-auto"
            style={{
              backgroundColor: "#FFFFFF",
              borderBottom: "1px solid rgba(44,26,18,0.12)",
            }}
          >
            {COLUMNS.map((col) => {
              const count = grouped[col.status].length;
              const isActive = activeTab === col.status;
              return (
                <button
                  key={col.status}
                  type="button"
                  onClick={() => setActiveTab(col.status)}
                  className="flex items-center gap-2 px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors shrink-0"
                  style={{
                    color: isActive ? col.accentColor : "#6B4E3D",
                    borderBottom: isActive
                      ? `2px solid ${col.accentColor}`
                      : "2px solid transparent",
                  }}
                >
                  <span
                    style={{
                      color: isActive ? col.accentColor : "#9A8A7A",
                    }}
                  >
                    {col.icon}
                  </span>
                  {col.label}
                  {count > 0 && (
                    <span
                      className="text-xs font-bold px-1.5 py-0.5 rounded-full"
                      style={{
                        backgroundColor: col.badgeBg,
                        color: col.badgeText,
                      }}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ─ Mobile: active tab cards ────────────────────────────────── */}
          <div className="md:hidden flex-1 overflow-y-auto p-4 space-y-3">
            {grouped[activeTab].length === 0 ? (
              <p
                className="text-sm text-center py-10"
                style={{ color: "#9A8A7A" }}
              >
                {COLUMNS.find((c) => c.status === activeTab)?.emptyMessage}
              </p>
            ) : (
              grouped[activeTab].map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  isNew={newOrderIds.has(order.id)}
                  onStatusChange={handleStatusChange}
                />
              ))
            )}
          </div>

          {/* ─ Desktop: 3-column grid ──────────────────────────────────── */}
          {/* Bug 3 fix: overflow-hidden scopes the grid; min-w-0 on each  */}
          {/* column prevents content from pushing past the cell boundary.  */}
          <div className="hidden md:grid md:grid-cols-3 gap-5 flex-1 min-h-0 p-5 overflow-hidden">
            {COLUMNS.map((col) => (
              <OrderColumn
                key={col.status}
                config={col}
                orders={grouped[col.status]}
                newOrderIds={newOrderIds}
                onStatusChange={handleStatusChange}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
