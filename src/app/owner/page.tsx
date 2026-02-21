"use client";

// src/app/owner/page.tsx
// ============================================================
// Owner Dashboard — business insights across Day / Week / Month.
// KPI cards with period comparison, 7-day trend, adaptive orders
// chart (hourly ↔ daily), popular items, revenue by category,
// customization stats, order status, Revenue by Day of Week
// (month view only).
// ============================================================

import { useState, useEffect } from "react";
import { NavLinks } from "@/components/NavLinks";
import {
  DollarSign,
  ShoppingBag,
  TrendingUp,
  TrendingDown,
  Clock,
  Coffee,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  LabelList,
} from "recharts";
import {
  getDayRange,
  getWeekRange,
  getMonthRange,
  shiftDateStr,
  fetchStats,
  fetchOrdersByHour,
  fetchOrdersByDay,
  fetchPopularItems,
  fetchRevenueByCategory,
  fetchCustomizationStats,
  fetchOrderStatusBreakdown,
  fetchSevenDayRevenue,
  fetchRevenueByDayOfWeek,
} from "@/lib/dashboard-service";
import type {
  DateRange,
  DailyStats,
  HourlyData,
  DailyBarData,
  PopularItem,
  CategoryRevenue,
  CustomizationStats,
  StatusBreakdown,
  TrendDay,
  DayOfWeekRevenue,
} from "@/lib/dashboard-service";

// ── Types ─────────────────────────────────────────────────────────────────────

type ViewMode = "day" | "week" | "month";

// ── Date helpers ──────────────────────────────────────────────────────────────

function todayStr(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatDisplayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date  = new Date(y, m - 1, d);
  const today = new Date();
  const isToday =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth()    === today.getMonth() &&
    date.getDate()     === today.getDate();

  const label = date.toLocaleDateString("en-US", {
    month: "long",
    day:   "numeric",
    year:  "numeric",
  });
  return isToday ? `Today — ${label}` : label;
}

// ── KPI comparison helper ─────────────────────────────────────────────────────

function pctChange(current: number, prior: number): number | null {
  if (prior === 0) return null;
  return Math.round(((current - prior) / prior) * 100);
}

// ── Recharts custom tooltips ──────────────────────────────────────────────────

function BarTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const count = payload[0].value;
  return (
    <div
      className="rounded-lg px-3 py-2 text-sm shadow-md"
      style={{ backgroundColor: "#FFFDF7", border: "1px solid rgba(44,26,18,0.12)" }}
    >
      <p className="font-semibold" style={{ color: "#2C1A12" }}>{label}</p>
      <p style={{ color: "#6B4E3D" }}>
        {count} order{count !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

function DayBarTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const count = payload[0].value;
  const parts = (label ?? "").split("-").map(Number);
  const displayLabel =
    parts.length === 3
      ? new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString("en-US", {
          weekday: "short",
          month:   "short",
          day:     "numeric",
        })
      : label;
  return (
    <div
      className="rounded-lg px-3 py-2 text-sm shadow-md"
      style={{ backgroundColor: "#FFFDF7", border: "1px solid rgba(44,26,18,0.12)" }}
    >
      <p className="font-semibold" style={{ color: "#2C1A12" }}>{displayLabel}</p>
      <p style={{ color: "#6B4E3D" }}>
        {count} order{count !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

function TrendTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg px-3 py-2 text-sm shadow-md"
      style={{ backgroundColor: "#FFFDF7", border: "1px solid rgba(44,26,18,0.12)" }}
    >
      <p className="font-semibold" style={{ color: "#2C1A12" }}>{label}</p>
      <p style={{ color: "#6B4E3D" }}>${payload[0].value.toFixed(2)}</p>
    </div>
  );
}

function DonutTooltip({ active, payload }: {
  active?: boolean;
  payload?: { value: number; name: string; payload: CategoryRevenue & { total: number } }[];
}) {
  if (!active || !payload?.length) return null;
  const { name, value, payload: inner } = payload[0];
  const pct = inner.total > 0 ? Math.round((value / inner.total) * 100) : 0;
  return (
    <div
      className="rounded-lg px-3 py-2 text-sm shadow-md"
      style={{ backgroundColor: "#FFFDF7", border: "1px solid rgba(44,26,18,0.12)" }}
    >
      <p className="font-semibold" style={{ color: "#2C1A12" }}>{name}</p>
      <p style={{ color: "#6B4E3D" }}>${value.toFixed(2)} · {pct}%</p>
    </div>
  );
}

// ── Colour palettes ───────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  coffee: "#6B2D12",
  tea:    "#5A8A6A",
  pastry: "#D4943A",
  addon:  "#9E9189",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-sm font-semibold uppercase tracking-wider mb-4"
      style={{ color: "#9A8A7A" }}
    >
      {children}
    </h2>
  );
}

interface KPICardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  loading: boolean;
  /** Integer % change vs prior period. null = no prior data to compare. */
  change?: number | null;
  /** Label for comparison text, e.g. "vs yesterday" / "vs last week". */
  compareLabel?: string;
}

function KPICard({ label, value, icon, loading, change, compareLabel = "vs yesterday" }: KPICardProps) {
  const hasChange    = change != null;
  const isUp         = hasChange && change! > 0;
  const isDown       = hasChange && change! < 0;
  const changeColor  = isUp ? "#16A34A" : isDown ? "#DC2626" : "#9A8A7A";
  const changePrefix = isUp ? "+" : "";

  return (
    <div className="relative bg-white rounded-xl p-5 card-shadow">
      {/* icon */}
      <div className="absolute top-4 right-4 opacity-20">
        {icon}
      </div>

      {/* metric */}
      {loading ? (
        <div className="h-9 w-28 rounded-lg bg-gray-100 animate-pulse mb-1" />
      ) : (
        <p
          className="text-3xl font-bold tracking-tight leading-none mb-1"
          style={{ color: "#2C1A12" }}
        >
          {value}
        </p>
      )}

      {/* period comparison — subtle, below the number */}
      {loading ? (
        <div className="h-3.5 w-20 rounded bg-gray-100 animate-pulse mb-2" />
      ) : (
        <div className="flex items-center gap-1 mb-2" style={{ minHeight: 18 }}>
          {hasChange ? (
            <>
              {isUp   && <TrendingUp   className="w-3 h-3 shrink-0" style={{ color: changeColor }} />}
              {isDown && <TrendingDown className="w-3 h-3 shrink-0" style={{ color: changeColor }} />}
              <span className="text-xs font-medium" style={{ color: changeColor }}>
                {changePrefix}{change}% {compareLabel}
              </span>
            </>
          ) : (
            <span className="text-xs" style={{ color: "#9A8A7A" }}>— {compareLabel}</span>
          )}
        </div>
      )}

      {/* label */}
      <p className="text-sm" style={{ color: "#9A8A7A" }}>{label}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div
      className="flex items-center justify-center py-12 rounded-xl"
      style={{
        backgroundColor: "rgba(44,26,18,0.03)",
        border: "1px dashed rgba(44,26,18,0.12)",
      }}
    >
      <p className="text-sm" style={{ color: "#9A8A7A" }}>{message}</p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OwnerDashboard() {
  const [mounted, setMounted]               = useState(false);
  const [viewMode, setViewMode]             = useState<ViewMode>("day");
  const [selectedDate, setSelectedDate]     = useState(todayStr);
  const [loading, setLoading]               = useState(true);

  const [stats,       setStats]       = useState<DailyStats | null>(null);
  const [prevStats,   setPrevStats]   = useState<DailyStats | null>(null);
  const [trend,       setTrend]       = useState<TrendDay[]>([]);
  const [hourly,      setHourly]      = useState<HourlyData[]>([]);
  const [dailyBars,   setDailyBars]   = useState<DailyBarData[]>([]);
  const [items,       setItems]       = useState<PopularItem[]>([]);
  const [categories,  setCategories]  = useState<CategoryRevenue[]>([]);
  const [customStats, setCustomStats] = useState<CustomizationStats | null>(null);
  const [status,      setStatus]      = useState<StatusBreakdown | null>(null);
  const [dowRevenue,  setDowRevenue]  = useState<DayOfWeekRevenue[]>([]);

  // SSR guard — recharts uses ResizeObserver which is unavailable server-side
  useEffect(() => { setMounted(true); }, []);

  // Fetch all dashboard data whenever the view mode or selected date changes
  useEffect(() => {
    if (!mounted) return;

    let cancelled = false;
    setLoading(true);

    async function load() {
      // ── Build current + previous ranges ────────────────────────────────────
      let currentRange: DateRange;
      let prevRange: DateRange;

      if (viewMode === "day") {
        currentRange = getDayRange(selectedDate);
        prevRange    = getDayRange(shiftDateStr(selectedDate, -1));
      } else if (viewMode === "week") {
        currentRange = getWeekRange(selectedDate);
        prevRange    = getWeekRange(shiftDateStr(selectedDate, -7));
      } else {
        currentRange = getMonthRange(selectedDate);
        // Previous month: go to the same day in prior month (JS handles overflow)
        const [y, m, d] = selectedDate.split("-").map(Number);
        const prevMonDate = new Date(y, m - 2, d);
        const prevMonStr  = [
          prevMonDate.getFullYear(),
          String(prevMonDate.getMonth() + 1).padStart(2, "0"),
          String(prevMonDate.getDate()).padStart(2, "0"),
        ].join("-");
        prevRange = getMonthRange(prevMonStr);
      }

      // ── Parallel fetches ────────────────────────────────────────────────────
      const [s, pS, tr, h, db, i, c, cs, sb, dow] = await Promise.all([
        fetchStats(currentRange),
        fetchStats(prevRange),
        fetchSevenDayRevenue(selectedDate),
        viewMode === "day" ? fetchOrdersByHour(selectedDate) : Promise.resolve([] as HourlyData[]),
        viewMode !== "day" ? fetchOrdersByDay(currentRange)  : Promise.resolve([] as DailyBarData[]),
        fetchPopularItems(currentRange),
        fetchRevenueByCategory(currentRange),
        fetchCustomizationStats(currentRange),
        fetchOrderStatusBreakdown(currentRange),
        viewMode === "month"
          ? fetchRevenueByDayOfWeek(currentRange)
          : Promise.resolve([] as DayOfWeekRevenue[]),
      ]);

      if (cancelled) return;
      setStats(s);
      setPrevStats(pS);
      setTrend(tr);
      setHourly(h as HourlyData[]);
      setDailyBars(db as DailyBarData[]);
      setItems(i);
      setCategories(c);
      setCustomStats(cs);
      setStatus(sb);
      setDowRevenue(dow as DayOfWeekRevenue[]);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [mounted, viewMode, selectedDate]);

  // ── Derived values ──────────────────────────────────────────────────────────

  const today     = todayStr();
  const hasOrders = (stats?.totalOrders ?? 0) > 0;

  const compareLabel =
    viewMode === "day"   ? "vs yesterday" :
    viewMode === "week"  ? "vs last week" :
                           "vs last month";

  const revenueChange = (stats && prevStats)
    ? pctChange(stats.totalRevenue,  prevStats.totalRevenue)  : null;
  const ordersChange = (stats && prevStats)
    ? pctChange(stats.totalOrders,   prevStats.totalOrders)   : null;
  const aovChange = (stats && prevStats)
    ? pctChange(stats.avgOrderValue, prevStats.avgOrderValue) : null;

  const maxHourlyCount = hourly.length > 0 ? Math.max(...hourly.map((h) => h.count)) : 0;

  const totalCategoryRevenue = categories.reduce((s, c) => s + c.revenue, 0);
  const categoriesWithTotal  = categories.map((c) => ({ ...c, total: totalCategoryRevenue }));

  // ── Date navigation helpers ─────────────────────────────────────────────────

  function navigate(dir: -1 | 1) {
    if (viewMode === "day") {
      const next = shiftDateStr(selectedDate, dir);
      if (dir > 0 && next > today) return;
      setSelectedDate(next);
    } else if (viewMode === "week") {
      const next = shiftDateStr(selectedDate, dir * 7);
      if (dir > 0 && next > today) return;
      setSelectedDate(next);
    } else {
      const [y, m, d] = selectedDate.split("-").map(Number);
      const nextDate  = new Date(y, m - 1 + dir, d);
      const nextStr   = [
        nextDate.getFullYear(),
        String(nextDate.getMonth() + 1).padStart(2, "0"),
        String(nextDate.getDate()).padStart(2, "0"),
      ].join("-");
      if (dir > 0 && nextStr > today) return;
      setSelectedDate(nextStr);
    }
  }

  function isNextDisabled(): boolean {
    if (viewMode === "day")  return selectedDate >= today;
    if (viewMode === "week") return shiftDateStr(selectedDate, 7) > today;
    // month: disable if first of next month > today
    const [y, m] = selectedDate.split("-").map(Number);
    const nextMonthFirst = [
      String(m === 12 ? y + 1 : y),
      String(m === 12 ? 1 : m + 1).padStart(2, "0"),
      "01",
    ].join("-");
    return nextMonthFirst > today;
  }

  function formatDateLabel(): string {
    if (viewMode === "day") return formatDisplayDate(selectedDate);
    if (viewMode === "week") {
      const wr    = getWeekRange(selectedDate);
      const start = new Date(wr.start);
      const end   = new Date(wr.end);
      return (
        start.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
        " – " +
        end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      );
    }
    // month
    const [y, m] = selectedDate.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
      month: "long",
      year:  "numeric",
    });
  }

  // X-axis tick formatter for the daily bar chart (week / month)
  function dayBarTickFormatter(dateStr: string): string {
    const parts = dateStr.split("-").map(Number);
    if (parts.length !== 3) return dateStr;
    const [y, m, d] = parts;
    if (viewMode === "week") {
      return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short" });
    }
    // month — just the day number, no leading zero
    return String(d);
  }

  // ── SSR guard ──────────────────────────────────────────────────────────────

  if (!mounted) {
    return <div className="min-h-screen" style={{ backgroundColor: "#FAF7F2" }} />;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: "#FAF7F2" }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
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
          Owner Dashboard
        </span>
      </header>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-8">

          {/* ── View mode toggle + date navigation ──────────────────────────── */}
          <div className="flex flex-wrap items-center gap-4">

            {/* Segmented Day / Week / Month control */}
            <div
              className="flex rounded-lg overflow-hidden"
              style={{ border: "1px solid rgba(44,26,18,0.15)" }}
            >
              {(["day", "week", "month"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setViewMode(m)}
                  className="px-4 py-1.5 text-sm font-medium capitalize transition-colors"
                  style={{
                    backgroundColor: viewMode === m ? "#2C1A12" : "white",
                    color:           viewMode === m ? "#FAF3E8" : "#6B4E3D",
                  }}
                >
                  {m === "day" ? "Day" : m === "week" ? "Week" : "Month"}
                </button>
              ))}
            </div>

            {/* Navigation arrows + date label / date input */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-white"
                style={{ border: "1px solid rgba(44,26,18,0.15)", color: "#6B4E3D" }}
                aria-label="Previous period"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {viewMode === "day" ? (
                <>
                  <input
                    type="date"
                    value={selectedDate}
                    max={today}
                    onChange={(e) => {
                      if (e.target.value && e.target.value <= today) {
                        setSelectedDate(e.target.value);
                      }
                    }}
                    className="text-sm font-medium rounded-lg px-3 py-1.5"
                    style={{
                      border: "1px solid rgba(44,26,18,0.15)",
                      color: "#2C1A12",
                      backgroundColor: "white",
                    }}
                  />
                  <span className="text-sm font-medium" style={{ color: "#6B4E3D" }}>
                    {formatDisplayDate(selectedDate)}
                  </span>
                </>
              ) : (
                <span
                  className="text-sm font-medium"
                  style={{ color: "#2C1A12", minWidth: 200, textAlign: "center" }}
                >
                  {formatDateLabel()}
                </span>
              )}

              <button
                type="button"
                onClick={() => navigate(1)}
                disabled={isNextDisabled()}
                className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ border: "1px solid rgba(44,26,18,0.15)", color: "#6B4E3D" }}
                aria-label="Next period"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* ── KPI cards ───────────────────────────────────────────────────── */}
          <section>
            <SectionTitle>At a glance</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KPICard
                label="Total Revenue"
                value={stats ? `$${stats.totalRevenue.toFixed(2)}` : "$0.00"}
                icon={<DollarSign className="w-8 h-8" style={{ color: "#2C1A12" }} />}
                loading={loading}
                change={revenueChange}
                compareLabel={compareLabel}
              />
              <KPICard
                label="Total Orders"
                value={
                  stats
                    ? `${stats.totalOrders} order${stats.totalOrders !== 1 ? "s" : ""}`
                    : "0 orders"
                }
                icon={<ShoppingBag className="w-8 h-8" style={{ color: "#2C1A12" }} />}
                loading={loading}
                change={ordersChange}
                compareLabel={compareLabel}
              />
              <KPICard
                label="Avg Order Value"
                value={
                  stats && stats.totalOrders > 0
                    ? `$${stats.avgOrderValue.toFixed(2)}`
                    : "$0.00"
                }
                icon={<TrendingUp className="w-8 h-8" style={{ color: "#2C1A12" }} />}
                loading={loading}
                change={aovChange}
                compareLabel={compareLabel}
              />
              <KPICard
                label="Avg Fulfillment Time"
                value={
                  stats?.avgFulfillmentTime != null
                    ? `${stats.avgFulfillmentTime.toFixed(1)} min`
                    : "—"
                }
                icon={<Clock className="w-8 h-8" style={{ color: "#2C1A12" }} />}
                loading={loading}
              />
            </div>
          </section>

          {/* ── 7-day revenue trend ──────────────────────────────────────────── */}
          <section>
            <SectionTitle>Last 7 days</SectionTitle>
            <div className="bg-white rounded-xl p-5 card-shadow" style={{ height: 220 }}>
              {loading ? (
                <div className="h-full flex items-center justify-center">
                  <div className="h-4 w-32 rounded bg-gray-100 animate-pulse" />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={trend}
                    margin={{ top: 8, right: 12, left: 4, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#D4943A" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="#D4943A" stopOpacity={0}    />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(44,26,18,0.08)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 12, fill: "#9A8A7A" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tickFormatter={(v: number) => `$${v}`}
                      tick={{ fontSize: 12, fill: "#9A8A7A" }}
                      tickLine={false}
                      axisLine={false}
                      width={48}
                    />
                    <Tooltip
                      content={<TrendTooltip />}
                      cursor={{ stroke: "rgba(212,148,58,0.25)", strokeWidth: 1 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="#D4943A"
                      strokeWidth={2}
                      fill="url(#revenueGrad)"
                      dot={{ fill: "#D4943A", r: 4, strokeWidth: 0 }}
                      activeDot={{ r: 6, fill: "#D4943A", strokeWidth: 0 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          {/* ── Orders by hour (day) / by day (week · month) ─────────────────── */}
          <section>
            <SectionTitle>
              {viewMode === "day" ? "Orders by Hour" : "Orders by Day"}
            </SectionTitle>

            {!loading && (viewMode === "day" ? hourly : dailyBars).length === 0 ? (
              <EmptyState message="No orders for this period." />
            ) : (
              <div className="bg-white rounded-xl p-5 card-shadow" style={{ height: 280 }}>
                {loading ? (
                  <div className="h-full flex items-center justify-center">
                    <div className="h-4 w-32 rounded bg-gray-100 animate-pulse" />
                  </div>
                ) : viewMode === "day" ? (
                  /* ── Hourly bar chart (day mode) ──────────────────────────── */
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={hourly}
                      margin={{ top: 20, right: 8, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(44,26,18,0.08)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 12, fill: "#9A8A7A" }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 12, fill: "#9A8A7A" }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        content={<BarTooltip />}
                        cursor={{ fill: "rgba(212,148,58,0.08)" }}
                      />
                      <Bar
                        dataKey="count"
                        fill="#D4943A"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={40}
                      >
                        {/* "Peak · N" label above the tallest bar only */}
                        <LabelList
                          dataKey="count"
                          content={(props: any) => {
                            const x     = Number(props.x     ?? 0);
                            const y     = Number(props.y     ?? 0);
                            const width = Number(props.width ?? 0);
                            const val   = Number(props.value ?? 0);
                            if (val !== maxHourlyCount || maxHourlyCount === 0) return null;
                            return (
                              <text
                                x={x + width / 2}
                                y={y - 6}
                                textAnchor="middle"
                                fontSize={10}
                                fontWeight={600}
                                fill="#D4943A"
                              >
                                Peak · {val}
                              </text>
                            );
                          }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  /* ── Daily bar chart (week / month mode) ──────────────────── */
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={dailyBars}
                      margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(44,26,18,0.08)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="dateStr"
                        tickFormatter={dayBarTickFormatter}
                        interval={viewMode === "month" ? 4 : 0}
                        tick={{ fontSize: 12, fill: "#9A8A7A" }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 12, fill: "#9A8A7A" }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        content={<DayBarTooltip />}
                        cursor={{ fill: "rgba(212,148,58,0.08)" }}
                      />
                      <Bar
                        dataKey="count"
                        fill="#D4943A"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={viewMode === "week" ? 48 : 24}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            )}
          </section>

          {/* ── Revenue by Day of Week (month view only) ─────────────────────── */}
          {viewMode === "month" && (
            <section>
              <SectionTitle>Revenue by Day of Week</SectionTitle>
              {!loading && dowRevenue.every((d) => d.revenue === 0) ? (
                <EmptyState message="No revenue data for this month." />
              ) : (
                <div className="bg-white rounded-xl p-5 card-shadow" style={{ height: 220 }}>
                  {loading ? (
                    <div className="h-full flex items-center justify-center">
                      <div className="h-4 w-32 rounded bg-gray-100 animate-pulse" />
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={dowRevenue}
                        margin={{ top: 8, right: 8, left: 4, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="rgba(44,26,18,0.08)"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="day"
                          tick={{ fontSize: 12, fill: "#9A8A7A" }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          tickFormatter={(v: number) => `$${v}`}
                          tick={{ fontSize: 12, fill: "#9A8A7A" }}
                          tickLine={false}
                          axisLine={false}
                          width={50}
                        />
                        <Tooltip
                          content={<TrendTooltip />}
                          cursor={{ fill: "rgba(212,148,58,0.08)" }}
                        />
                        <Bar
                          dataKey="revenue"
                          fill="#6B2D12"
                          radius={[4, 4, 0, 0]}
                          maxBarSize={56}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              )}
            </section>
          )}

          {/* ── Popular items + Revenue by category ─────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Popular items */}
            <section>
              <SectionTitle>Popular items</SectionTitle>
              {!loading && items.length === 0 ? (
                <EmptyState message="No order items for this period." />
              ) : (
                <div className="bg-white rounded-xl card-shadow overflow-hidden">
                  {loading ? (
                    <div className="p-5 space-y-3">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="h-10 rounded-lg bg-gray-100 animate-pulse" />
                      ))}
                    </div>
                  ) : (
                    <ol className="divide-y" style={{ borderColor: "rgba(44,26,18,0.06)" }}>
                      {items.map((item, idx) => {
                        const maxQty = items[0]?.qtySold || 1;
                        const barPct = Math.round((item.qtySold / maxQty) * 100);
                        return (
                          <li key={item.key} className="px-5 py-3.5">
                            <div className="flex items-center justify-between gap-3 mb-1.5">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span
                                  className="text-sm font-bold shrink-0 w-5 text-right"
                                  style={{ color: "#9A8A7A" }}
                                >
                                  {idx + 1}
                                </span>
                                <span
                                  className="text-sm font-medium truncate"
                                  style={{ color: "#2C1A12" }}
                                >
                                  {item.displayName}
                                </span>
                              </div>
                              <div
                                className="flex items-center gap-3 shrink-0 text-xs"
                                style={{ color: "#6B4E3D" }}
                              >
                                <span className="font-medium">{item.qtySold} sold</span>
                                <span style={{ color: "#9A8A7A" }}>
                                  ${item.totalRevenue.toFixed(2)}
                                </span>
                              </div>
                            </div>
                            <div
                              className="ml-7 rounded-full overflow-hidden"
                              style={{ height: 3, backgroundColor: "rgba(44,26,18,0.06)" }}
                            >
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${barPct}%`,
                                  backgroundColor: "#D4943A",
                                  opacity: 0.65,
                                }}
                              />
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </div>
              )}
            </section>

            {/* Revenue by category */}
            <section>
              <SectionTitle>Revenue by category</SectionTitle>
              {!loading && categories.length === 0 ? (
                <EmptyState message="No revenue data for this period." />
              ) : (
                <div className="bg-white rounded-xl card-shadow p-5">
                  {loading ? (
                    <div className="h-64 flex items-center justify-center">
                      <div className="h-4 w-32 rounded bg-gray-100 animate-pulse" />
                    </div>
                  ) : (
                    <>
                      <div style={{ height: 220 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={categoriesWithTotal}
                              dataKey="revenue"
                              nameKey="label"
                              innerRadius="52%"
                              outerRadius="78%"
                              paddingAngle={2}
                            >
                              {categoriesWithTotal.map((entry) => (
                                <Cell
                                  key={entry.category}
                                  fill={CATEGORY_COLORS[entry.category] ?? "#9E9189"}
                                />
                              ))}
                            </Pie>
                            <Tooltip content={<DonutTooltip />} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Custom legend */}
                      <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-3">
                        {categoriesWithTotal.map((c) => {
                          const pct = totalCategoryRevenue > 0
                            ? Math.round((c.revenue / totalCategoryRevenue) * 100)
                            : 0;
                          return (
                            <div key={c.category} className="flex items-center gap-2">
                              <div
                                className="w-2.5 h-2.5 rounded-sm shrink-0"
                                style={{
                                  backgroundColor:
                                    CATEGORY_COLORS[c.category] ?? "#9E9189",
                                }}
                              />
                              <span className="text-xs" style={{ color: "#6B4E3D" }}>
                                {c.label}
                              </span>
                              <span
                                className="ml-auto text-xs font-medium"
                                style={{ color: "#2C1A12" }}
                              >
                                {pct}%
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </section>
          </div>

          {/* ── Customization insights ───────────────────────────────────────── */}
          <section>
            <SectionTitle>Customization insights</SectionTitle>
            {!loading && !hasOrders ? (
              <EmptyState message="No data for this period." />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

                <div className="bg-white rounded-xl p-4 card-shadow">
                  <p className="text-xs mb-2" style={{ color: "#9A8A7A" }}>Most popular milk</p>
                  {loading ? (
                    <div className="h-6 w-24 rounded bg-gray-100 animate-pulse" />
                  ) : customStats?.milkBreakdown.length ? (
                    <>
                      <p className="text-xl font-bold" style={{ color: "#2C1A12" }}>
                        {customStats.milkBreakdown[0].name}
                      </p>
                      <p className="text-sm mt-0.5" style={{ color: "#6B4E3D" }}>
                        {customStats.milkBreakdown[0].pct}% of milk-based drinks
                      </p>
                      {customStats.milkBreakdown.slice(1, 3).map((m) => (
                        <p key={m.name} className="text-xs mt-1" style={{ color: "#9A8A7A" }}>
                          {m.name} · {m.pct}%
                        </p>
                      ))}
                    </>
                  ) : (
                    <p className="text-xl font-bold" style={{ color: "#9A8A7A" }}>—</p>
                  )}
                </div>

                <div className="bg-white rounded-xl p-4 card-shadow">
                  <p className="text-xs mb-2" style={{ color: "#9A8A7A" }}>Top add-on</p>
                  {loading ? (
                    <div className="h-6 w-32 rounded bg-gray-100 animate-pulse" />
                  ) : customStats?.topAddOn ? (
                    <>
                      <p
                        className="text-xl font-bold leading-tight"
                        style={{ color: "#2C1A12" }}
                      >
                        {customStats.topAddOn.name}
                      </p>
                      <p className="text-sm mt-0.5" style={{ color: "#6B4E3D" }}>
                        {customStats.topAddOn.totalQty} sold
                      </p>
                    </>
                  ) : (
                    <p className="text-xl font-bold" style={{ color: "#9A8A7A" }}>—</p>
                  )}
                </div>

                <div className="bg-white rounded-xl p-4 card-shadow">
                  <p className="text-xs mb-2" style={{ color: "#9A8A7A" }}>Size split</p>
                  {loading ? (
                    <div className="h-6 w-24 rounded bg-gray-100 animate-pulse" />
                  ) : customStats?.sizeBreakdown.length ? (
                    <>
                      <p className="text-xl font-bold" style={{ color: "#2C1A12" }}>
                        {customStats.sizeBreakdown[0].name}
                      </p>
                      <p className="text-sm mt-0.5" style={{ color: "#6B4E3D" }}>
                        {customStats.sizeBreakdown[0].pct}% of drinks
                      </p>
                      {customStats.sizeBreakdown.slice(1).map((s) => (
                        <p key={s.name} className="text-xs mt-1" style={{ color: "#9A8A7A" }}>
                          {s.name} · {s.pct}%
                        </p>
                      ))}
                    </>
                  ) : (
                    <p className="text-xl font-bold" style={{ color: "#9A8A7A" }}>—</p>
                  )}
                </div>

                <div className="bg-white rounded-xl p-4 card-shadow">
                  <p className="text-xs mb-2" style={{ color: "#9A8A7A" }}>Hot vs Iced</p>
                  {loading ? (
                    <div className="h-6 w-28 rounded bg-gray-100 animate-pulse" />
                  ) : customStats?.tempBreakdown.length ? (
                    <>
                      <p className="text-xl font-bold" style={{ color: "#2C1A12" }}>
                        {customStats.hotPct}% hot
                      </p>
                      <p className="text-sm mt-0.5" style={{ color: "#6B4E3D" }}>
                        {customStats.icedPct}% iced
                      </p>
                      <div
                        className="mt-3 flex rounded-full overflow-hidden"
                        style={{ height: 6, backgroundColor: "rgba(44,26,18,0.08)" }}
                      >
                        <div
                          style={{
                            width: `${customStats.hotPct}%`,
                            backgroundColor: "#6B2D12",
                          }}
                        />
                        <div
                          style={{
                            width: `${customStats.icedPct}%`,
                            backgroundColor: "#5A8A6A",
                          }}
                        />
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-xs" style={{ color: "#6B2D12" }}>hot</span>
                        <span className="text-xs" style={{ color: "#5A8A6A" }}>iced</span>
                      </div>
                    </>
                  ) : (
                    <p className="text-xl font-bold" style={{ color: "#9A8A7A" }}>—</p>
                  )}
                </div>

              </div>
            )}
          </section>

          {/* ── Order status breakdown ───────────────────────────────────────── */}
          <section className="pb-8">
            <SectionTitle>Order status</SectionTitle>
            <div className="bg-white rounded-xl p-5 card-shadow">
              {loading ? (
                <div className="space-y-3">
                  <div className="h-5 w-48 rounded bg-gray-100 animate-pulse" />
                  <div className="h-3 rounded-full bg-gray-100 animate-pulse" />
                </div>
              ) : !status || status.total === 0 ? (
                <p className="text-sm text-center py-4" style={{ color: "#9A8A7A" }}>
                  No orders for this period.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-4 mb-5">
                    <div className="text-center">
                      <p className="text-2xl font-bold" style={{ color: "#2C1A12" }}>
                        {status.new}
                      </p>
                      <p className="text-xs mt-1" style={{ color: "#9A8A7A" }}>New</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold" style={{ color: "#D97706" }}>
                        {status.in_progress}
                      </p>
                      <p className="text-xs mt-1" style={{ color: "#9A8A7A" }}>In Progress</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold" style={{ color: "#16A34A" }}>
                        {status.completed}
                      </p>
                      <p className="text-xs mt-1" style={{ color: "#9A8A7A" }}>Completed</p>
                    </div>
                  </div>

                  <div>
                    <div
                      className="flex justify-between text-xs mb-1.5"
                      style={{ color: "#9A8A7A" }}
                    >
                      <span>Completion rate</span>
                      <span className="font-medium" style={{ color: "#2C1A12" }}>
                        {status.completedPct}% of {status.total} order{status.total !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div
                      className="w-full rounded-full overflow-hidden"
                      style={{ height: 8, backgroundColor: "rgba(44,26,18,0.08)" }}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${status.completedPct}%`,
                          backgroundColor:
                            status.completedPct >= 80 ? "#16A34A" :
                            status.completedPct >= 50 ? "#D97706" : "#DC2626",
                        }}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}
