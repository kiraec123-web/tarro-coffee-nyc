// src/lib/dashboard-service.ts
// ============================================================
// Owner Dashboard — data access layer.
// All range-based functions accept a DateRange (UTC ISO strings)
// produced by getDayRange / getWeekRange / getMonthRange.
// ============================================================

import { supabase } from "./supabase";
import type { Order, OrderItem, AddOnLineItem } from "./types";
import { DRINKS, PASTRIES, MILK_OPTIONS } from "./menu";

// ── Helpers ───────────────────────────────────────────────────────────────────

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ── Date range builders ───────────────────────────────────────────────────────

export type DateRange = { start: string; end: string };

/** Single calendar day (local midnight → 23:59:59.999). */
export function getDayRange(dateStr: string): DateRange {
  const [y, m, d] = dateStr.split("-").map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end   = new Date(y, m - 1, d, 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** ISO week (Mon–Sun) containing dateStr. */
export function getWeekRange(dateStr: string): DateRange {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow       = new Date(y, m - 1, d).getDay(); // 0=Sun … 6=Sat
  const daysToMon = dow === 0 ? -6 : 1 - dow;
  const monday    = new Date(y, m - 1, d + daysToMon);
  const sunday    = new Date(
    monday.getFullYear(),
    monday.getMonth(),
    monday.getDate() + 6
  );
  return {
    start: new Date(
      monday.getFullYear(), monday.getMonth(), monday.getDate(),
      0, 0, 0, 0
    ).toISOString(),
    end: new Date(
      sunday.getFullYear(), sunday.getMonth(), sunday.getDate(),
      23, 59, 59, 999
    ).toISOString(),
  };
}

/** Full calendar month containing dateStr. */
export function getMonthRange(dateStr: string): DateRange {
  const [y, m] = dateStr.split("-").map(Number);
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const end   = new Date(y, m, 0, 23, 59, 59, 999); // day-0 of next month = last day of this month
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Shift a YYYY-MM-DD string by delta calendar days. */
export function shiftDateStr(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + delta);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

/** Format an hour number (0–23) as a human-readable label. */
export function formatHourLabel(h: number): string {
  if (h === 0)  return "12am";
  if (h === 12) return "12pm";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

// ── Menu-based item classification ────────────────────────────────────────────
// Sort DRINKS by name length descending so "Matcha Latte" (12 chars) is tested
// before "Latte" (5 chars), preventing wrong category matches.

const DRINKS_BY_LENGTH = [...DRINKS].sort((a, b) => b.name.length - a.name.length);

function findDrink(itemName: string): typeof DRINKS[0] | undefined {
  const n = itemName.toLowerCase();
  return DRINKS_BY_LENGTH.find((d) => n.includes(d.name.toLowerCase()));
}

function isPastry(itemName: string): boolean {
  const n = itemName.toLowerCase();
  return PASTRIES.some((p) => n.includes(p.name.toLowerCase()));
}

// ── Typed query helpers ───────────────────────────────────────────────────────
// Supabase's generic type inference with partial select strings can collapse
// to `never`. These thin helpers cast to the known row shapes.

async function queryOrders<K extends keyof Order>(
  cols: string,
  start: string,
  end: string
): Promise<Pick<Order, K>[]> {
  const { data } = await supabase
    .from("orders")
    .select(cols)
    .gte("created_at", start)
    .lte("created_at", end);
  return (data ?? []) as Pick<Order, K>[];
}

async function queryOrderItems<K extends keyof OrderItem>(
  cols: string,
  orderIds: string[]
): Promise<Pick<OrderItem, K>[]> {
  if (orderIds.length === 0) return [];
  const { data } = await supabase
    .from("order_items")
    .select(cols)
    .in("order_id", orderIds);
  return (data ?? []) as Pick<OrderItem, K>[];
}

// ── Exported types ─────────────────────────────────────────────────────────────

export interface DailyStats {
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  /** null = no completed orders with timestamps in range */
  avgFulfillmentTime: number | null;
}

export interface HourlyData {
  hour: number;
  label: string;   // "7am", "12pm", etc.
  count: number;
}

export interface DailyBarData {
  dateStr: string; // "YYYY-MM-DD" — used as recharts dataKey
  count: number;
}

export interface PopularItem {
  key: string;
  displayName: string;
  qtySold: number;
  totalRevenue: number;
}

export interface CategoryRevenue {
  category: "coffee" | "tea" | "pastry" | "addon";
  label: string;
  revenue: number;
}

export interface CustomizationStats {
  milkBreakdown: { name: string; count: number; pct: number }[];
  sizeBreakdown: { name: string; count: number; pct: number }[];
  tempBreakdown: { name: string; count: number; pct: number }[];
  topAddOn: { name: string; totalQty: number } | null;
  hotPct: number;
  icedPct: number;
}

export interface StatusBreakdown {
  new: number;
  in_progress: number;
  completed: number;
  total: number;
  completedPct: number;
}

export interface TrendDay {
  dateStr: string;
  label: string;   // "Mon", "Tue", etc.
  revenue: number;
}

export interface DayOfWeekRevenue {
  day: string;     // "Mon" … "Sun"
  revenue: number;
}

// ── 1. Stats for a date range ─────────────────────────────────────────────────
// Replaces fetchDailyStats — accepts a DateRange so week/month views get
// aggregated totals. Avg fulfillment time uses completed_at - created_at.

export async function fetchStats(range: DateRange): Promise<DailyStats> {
  const rows = await queryOrders<"total_price" | "created_at" | "completed_at">(
    "total_price, created_at, completed_at",
    range.start,
    range.end
  );

  if (rows.length === 0) {
    return { totalRevenue: 0, totalOrders: 0, avgOrderValue: 0, avgFulfillmentTime: null };
  }

  const totalRevenue  = rows.reduce((s, o) => s + (o.total_price ?? 0), 0);
  const totalOrders   = rows.length;
  const avgOrderValue = totalRevenue / totalOrders;

  // Fulfillment time: avg minutes from created_at → completed_at (completed rows only)
  const completed = rows.filter((o) => o.completed_at);
  let avgFulfillmentTime: number | null = null;
  if (completed.length > 0) {
    const totalMs = completed.reduce((s, o) => {
      return s + (
        new Date(o.completed_at!).getTime() - new Date(o.created_at).getTime()
      );
    }, 0);
    avgFulfillmentTime = totalMs / completed.length / 60_000; // ms → minutes
  }

  return { totalRevenue, totalOrders, avgOrderValue, avgFulfillmentTime };
}

// ── 2. Orders by hour (day view only) ─────────────────────────────────────────
// Returns a full range from 7am–9pm with 0s for empty hours.

export async function fetchOrdersByHour(dateStr: string): Promise<HourlyData[]> {
  const { start, end } = getDayRange(dateStr);
  const rows = await queryOrders<"created_at">("created_at", start, end);

  if (rows.length === 0) return [];

  const hourMap: Record<number, number> = {};
  rows.forEach((o) => {
    const h = new Date(o.created_at).getHours();
    hourMap[h] = (hourMap[h] || 0) + 1;
  });

  const dataHours = Object.keys(hourMap).map(Number);
  const minHour   = Math.min(7, ...dataHours);
  const maxHour   = Math.max(21, ...dataHours);

  const result: HourlyData[] = [];
  for (let h = minHour; h <= maxHour; h++) {
    result.push({ hour: h, label: formatHourLabel(h), count: hourMap[h] || 0 });
  }
  return result;
}

// ── 3. Orders by day (week / month view) ──────────────────────────────────────
// Enumerates every calendar day in the range; days with no orders get count=0.

export async function fetchOrdersByDay(range: DateRange): Promise<DailyBarData[]> {
  const rows = await queryOrders<"created_at">("created_at", range.start, range.end);

  const dayMap: Record<string, number> = {};
  rows.forEach((o) => {
    const d   = new Date(o.created_at);
    const key = [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
    ].join("-");
    dayMap[key] = (dayMap[key] || 0) + 1;
  });

  // Determine the local start/end dates (getDate/Month/FullYear = local time)
  const rs = new Date(range.start);
  const re = new Date(range.end);
  const cur    = new Date(rs.getFullYear(), rs.getMonth(), rs.getDate());
  const endDay = new Date(re.getFullYear(), re.getMonth(), re.getDate());

  const result: DailyBarData[] = [];
  while (cur <= endDay) {
    const key = [
      cur.getFullYear(),
      String(cur.getMonth() + 1).padStart(2, "0"),
      String(cur.getDate()).padStart(2, "0"),
    ].join("-");
    result.push({ dateStr: key, count: dayMap[key] ?? 0 });
    cur.setDate(cur.getDate() + 1);
  }

  return result;
}

// ── 4. Popular items ───────────────────────────────────────────────────────────
// Grouped by item_name + size + temp (drinks) or item_name alone (pastries).

export async function fetchPopularItems(range: DateRange): Promise<PopularItem[]> {
  const orders = await queryOrders<"id">("id", range.start, range.end);
  if (orders.length === 0) return [];

  const ids   = orders.map((o) => o.id);
  const items = await queryOrderItems<"item_name" | "size" | "temp" | "item_price">(
    "item_name, size, temp, item_price",
    ids
  );

  const TEMP_EMBEDDED = ["cold", "iced", "hot", "frozen", "blended"];

  function makeDisplayName(item: Pick<OrderItem, "item_name" | "size" | "temp">): string {
    if (isPastry(item.item_name)) return item.item_name;
    const hasEmbedded = TEMP_EMBEDDED.some((w) =>
      item.item_name.toLowerCase().startsWith(w)
    );
    if (hasEmbedded) return `${cap(item.size)} ${item.item_name}`;
    return `${cap(item.size)} ${cap(item.temp)} ${item.item_name}`;
  }

  function makeKey(item: Pick<OrderItem, "item_name" | "size" | "temp">): string {
    if (isPastry(item.item_name)) return item.item_name;
    return `${item.item_name}|${item.size}|${item.temp}`;
  }

  const map: Record<string, { displayName: string; qtySold: number; totalRevenue: number }> = {};
  items.forEach((item) => {
    const key = makeKey(item);
    if (!map[key]) {
      map[key] = { displayName: makeDisplayName(item), qtySold: 0, totalRevenue: 0 };
    }
    map[key].qtySold      += 1;
    map[key].totalRevenue += item.item_price ?? 0;
  });

  return Object.entries(map)
    .map(([key, d]) => ({ key, ...d }))
    .sort((a, b) => b.qtySold - a.qtySold)
    .slice(0, 10);
}

// ── 5. Revenue by category ────────────────────────────────────────────────────
// Uses menu.ts as source of truth for base prices and categories.
//
// Split logic per order_item row:
//   • Base price   = DRINKS[match].sizes[size]   → "coffee" or "tea" bucket
//   • Milk upcharge = MILK_OPTIONS[milk].upcharge → "addon" bucket
//   • Explicit add_ons[] (shots, syrups)          → "addon" bucket
//   • Pastries: full item_price                   → "pastry" bucket

export async function fetchRevenueByCategory(range: DateRange): Promise<CategoryRevenue[]> {
  const orders = await queryOrders<"id">("id", range.start, range.end);
  if (orders.length === 0) return [];

  const ids   = orders.map((o) => o.id);
  const items = await queryOrderItems<"item_name" | "size" | "milk" | "item_price" | "add_ons">(
    "item_name, size, milk, item_price, add_ons",
    ids
  );

  const revenues = { coffee: 0, tea: 0, pastry: 0, addon: 0 };

  items.forEach((item) => {
    const drink = findDrink(item.item_name);
    if (drink) {
      const sizeKey: "small" | "large" = item.size === "large" ? "large" : "small";
      const basePrice    = drink.sizes[sizeKey];
      const milkUpcharge = MILK_OPTIONS.find((m) => m.name === item.milk)?.upcharge ?? 0;
      const addOns       = (item.add_ons as unknown as AddOnLineItem[] | null) ?? [];
      const addOnTotal   = addOns.reduce((s, a) => s + (a.qty ?? 0) * (a.unit_price ?? 0), 0);

      revenues[drink.category] += basePrice;
      revenues.addon            += milkUpcharge + addOnTotal;
    } else {
      revenues.pastry += item.item_price ?? 0;
    }
  });

  const LABELS: Record<string, string> = {
    coffee: "Coffee",
    tea:    "Tea",
    pastry: "Pastries",
    addon:  "Add-ons",
  };

  return (["coffee", "tea", "pastry", "addon"] as const)
    .map((cat) => ({ category: cat, label: LABELS[cat], revenue: revenues[cat] }))
    .filter((c) => c.revenue > 0.001);
}

// ── 6. Customization stats ────────────────────────────────────────────────────
// Milk type breakdown, size split, hot/iced split, top add-on.
// Pastry items are excluded from drink-centric stats.

export async function fetchCustomizationStats(range: DateRange): Promise<CustomizationStats> {
  const empty: CustomizationStats = {
    milkBreakdown: [],
    sizeBreakdown: [],
    tempBreakdown: [],
    topAddOn:      null,
    hotPct:        0,
    icedPct:       0,
  };

  const orders = await queryOrders<"id">("id", range.start, range.end);
  if (orders.length === 0) return empty;

  const ids   = orders.map((o) => o.id);
  const items = await queryOrderItems<"item_name" | "size" | "temp" | "milk" | "add_ons">(
    "item_name, size, temp, milk, add_ons",
    ids
  );

  if (items.length === 0) return empty;

  const drinks = items.filter((i) => !isPastry(i.item_name));

  // Milk breakdown (among drinks that have a milk value)
  const milkDrinks = drinks.filter((i) => i.milk);
  const milkCounts: Record<string, number> = {};
  milkDrinks.forEach((i) => {
    const m = i.milk!;
    milkCounts[m] = (milkCounts[m] || 0) + 1;
  });
  const milkTotal    = milkDrinks.length;
  const milkBreakdown = Object.entries(milkCounts)
    .map(([name, count]) => ({
      name: cap(name),
      count,
      pct: milkTotal > 0 ? Math.round((count / milkTotal) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // Size breakdown (all drinks)
  const sizeCounts: Record<string, number> = {};
  drinks.forEach((i) => { sizeCounts[i.size] = (sizeCounts[i.size] || 0) + 1; });
  const sizeTotal = drinks.length;
  const sizeBreakdown = Object.entries(sizeCounts)
    .map(([name, count]) => ({
      name: cap(name),
      count,
      pct: sizeTotal > 0 ? Math.round((count / sizeTotal) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // Temp breakdown
  const tempCounts: Record<string, number> = {};
  drinks.forEach((i) => { tempCounts[i.temp] = (tempCounts[i.temp] || 0) + 1; });
  const tempTotal = drinks.length;
  const tempBreakdown = Object.entries(tempCounts)
    .map(([name, count]) => ({
      name: cap(name),
      count,
      pct: tempTotal > 0 ? Math.round((count / tempTotal) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const hotPct  = tempTotal > 0 ? Math.round(((tempCounts["hot"]  ?? 0) / tempTotal) * 100) : 0;
  const icedPct = tempTotal > 0 ? Math.round(((tempCounts["iced"] ?? 0) / tempTotal) * 100) : 0;

  // Top add-on by total qty sold
  const addonQty: Record<string, number> = {};
  items.forEach((item) => {
    const addOns = (item.add_ons as unknown as AddOnLineItem[] | null) ?? [];
    addOns.forEach((a) => {
      addonQty[a.name] = (addonQty[a.name] || 0) + (a.qty ?? 1);
    });
  });
  const topEntry = Object.entries(addonQty).sort((a, b) => b[1] - a[1])[0];
  const topAddOn = topEntry ? { name: topEntry[0], totalQty: topEntry[1] } : null;

  return { milkBreakdown, sizeBreakdown, tempBreakdown, topAddOn, hotPct, icedPct };
}

// ── 7. Order status breakdown ─────────────────────────────────────────────────

export async function fetchOrderStatusBreakdown(range: DateRange): Promise<StatusBreakdown> {
  const rows = await queryOrders<"status">("status", range.start, range.end);

  const counts = { new: 0, in_progress: 0, completed: 0 };
  rows.forEach((o) => {
    if (o.status === "new")              counts.new++;
    else if (o.status === "in_progress") counts.in_progress++;
    else if (o.status === "completed")   counts.completed++;
  });

  const total = rows.length;
  return {
    ...counts,
    total,
    completedPct: total > 0 ? Math.round((counts.completed / total) * 100) : 0,
  };
}

// ── 8. 7-day revenue trend ─────────────────────────────────────────────────────
// Single query covering the full 7-day window, grouped client-side by local date.

export async function fetchSevenDayRevenue(endDateStr: string): Promise<TrendDay[]> {
  const sevenDaysAgo = shiftDateStr(endDateStr, -6);
  const start = getDayRange(sevenDaysAgo).start;
  const end   = getDayRange(endDateStr).end;

  const rows = await queryOrders<"total_price" | "created_at">(
    "total_price, created_at",
    start,
    end
  );

  const revenueByDate: Record<string, number> = {};
  rows.forEach((o) => {
    const d   = new Date(o.created_at);
    const key = [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
    ].join("-");
    revenueByDate[key] = (revenueByDate[key] || 0) + (o.total_price ?? 0);
  });

  const result: TrendDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const dateStr   = shiftDateStr(endDateStr, -i);
    const [y, m, d] = dateStr.split("-").map(Number);
    const date      = new Date(y, m - 1, d);
    const label     = date.toLocaleDateString("en-US", { weekday: "short" });
    result.push({ dateStr, label, revenue: revenueByDate[dateStr] ?? 0 });
  }

  return result;
}

// ── 9. Revenue by day of week (month view) ────────────────────────────────────
// Groups all orders in the range by local day-of-week (Mon–Sun order).

export async function fetchRevenueByDayOfWeek(range: DateRange): Promise<DayOfWeekRevenue[]> {
  const rows = await queryOrders<"total_price" | "created_at">(
    "total_price, created_at",
    range.start,
    range.end
  );

  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const revenueByDow: Record<number, number> = {};
  rows.forEach((o) => {
    const dow = new Date(o.created_at).getDay(); // 0=Sun … 6=Sat
    revenueByDow[dow] = (revenueByDow[dow] || 0) + (o.total_price ?? 0);
  });

  // Return Mon → Sun order
  return [1, 2, 3, 4, 5, 6, 0].map((dow) => ({
    day:     DAY_NAMES[dow],
    revenue: revenueByDow[dow] ?? 0,
  }));
}
