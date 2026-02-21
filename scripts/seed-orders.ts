#!/usr/bin/env node
/**
 * scripts/seed-orders.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Inserts ~50 realistic seed orders across the last 5 days into Supabase.
 *
 * Usage:
 *   npx tsx scripts/seed-orders.ts          # seed (exits if data exists)
 *   npx tsx scripts/seed-orders.ts --clear  # wipe all orders, then reseed
 */

import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";
import { DRINKS, MILK_OPTIONS, PASTRIES } from "../src/lib/menu";

// ── Utility ───────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weighted<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function randInt(lo: number, hi: number): number {
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function addMins(d: Date, m: number): Date {
  return new Date(d.getTime() + m * 60_000);
}

// ── Time slots ────────────────────────────────────────────────────────────────

type Slot = "morning" | "midday" | "afternoon" | "evening";

/** Random timestamp within the named time slot on baseDate (local time). */
function slotTime(baseDate: Date, slot: Slot): Date {
  const midnight = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate()
  );
  // [startMin, endMin) inclusive
  const ranges: Record<Slot, [number, number]> = {
    morning:   [7 * 60,       9 * 60 - 1],   // 07:00–08:59
    midday:    [11 * 60,      13 * 60 - 1],   // 11:00–12:59
    afternoon: [14 * 60,      17 * 60 - 1],   // 14:00–16:59
    evening:   [17 * 60,      20 * 60 - 1],   // 17:00–19:59
  };
  const [lo, hi] = ranges[slot];
  return new Date(midnight.getTime() + randInt(lo, hi) * 60_000);
}

/** Build a shuffled slot array for n orders using the 40/25/25/10 distribution. */
function makeSlots(n: number): Slot[] {
  const morning   = Math.round(n * 0.40);
  const midday    = Math.round(n * 0.25);
  const afternoon = Math.round(n * 0.25);
  const evening   = Math.max(0, n - morning - midday - afternoon);

  const slots: Slot[] = [
    ...Array<Slot>(morning).fill("morning"),
    ...Array<Slot>(midday).fill("midday"),
    ...Array<Slot>(afternoon).fill("afternoon"),
    ...Array<Slot>(evening).fill("evening"),
  ];

  // Fisher-Yates shuffle
  for (let i = slots.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  return slots;
}

// ── Item generators ───────────────────────────────────────────────────────────

type AddOnRow = { name: string; qty: number; unit_price: number };

type ItemRow = {
  item_name: string;
  size: "small" | "large";
  temp: "hot" | "iced";
  milk: string | null;
  sweetness: string;
  ice_level: string;
  add_ons: AddOnRow[];
  item_price: number;
  special_instructions: null;
};

function makeDrink(category: "coffee" | "tea"): ItemRow {
  const drinkName =
    category === "coffee"
      ? weighted(
          ["Latte", "Americano", "Cold Brew", "Mocha", "Coffee Frappuccino"],
          [30, 20, 15, 15, 20]
        )
      : weighted(
          ["Matcha Latte", "Black Tea", "Jasmine Tea", "Lemon Green Tea"],
          [40, 20, 20, 20]
        );

  const drink = DRINKS.find((d) => d.name === drinkName)!;
  const size  = weighted<"small" | "large">(["small", "large"], [40, 60]);
  const temp: "hot" | "iced" =
    drink.temps.length === 1
      ? drink.temps[0]
      : weighted(["hot", "iced"] as const, [50, 50]);

  const sweetness = weighted(
    ["regular", "less sugar", "no sugar", "extra sugar"],
    [60, 20, 10, 10]
  );

  const ice_level =
    temp === "iced" && !drink.isBlended
      ? weighted(
          ["regular", "less ice", "extra ice", "no ice"],
          [50, 25, 15, 10]
        )
      : "regular";

  const milk: string | null = drink.hasMilk
    ? weighted(["whole", "oat", "almond", "skim"], [30, 40, 20, 10])
    : null;

  let price = drink.sizes[size];
  if (milk) {
    price += MILK_OPTIONS.find((m) => m.name === milk)?.upcharge ?? 0;
  }

  const add_ons: AddOnRow[] = [];

  if (Math.random() < 0.40) {
    const r = Math.random();
    if (r < 0.40 && drink.hasEspresso) {
      // Extra espresso shot (espresso drinks only)
      const qty = randInt(1, 2);
      add_ons.push({ name: "Extra Espresso Shot", qty, unit_price: 1.50 });
      price += qty * 1.50;
    } else if (r < 0.70) {
      // Caramel syrup
      const qty = randInt(1, 3);
      add_ons.push({ name: "Caramel Syrup", qty, unit_price: 0.50 });
      price += qty * 0.50;
    } else {
      // Hazelnut syrup
      const qty = randInt(1, 2);
      add_ons.push({ name: "Hazelnut Syrup", qty, unit_price: 0.50 });
      price += qty * 0.50;
    }
  }

  return {
    item_name: drinkName,
    size,
    temp,
    milk,
    sweetness,
    ice_level,
    add_ons,
    item_price: Math.round(price * 100) / 100,
    special_instructions: null,
  };
}

function makePastry(): ItemRow {
  // PASTRIES = [Plain Croissant, Chocolate Croissant, Chocolate Chip Cookie, Banana Bread]
  const pastry = weighted(PASTRIES, [20, 40, 20, 20]);
  return {
    item_name: pastry.name,
    size: "small",
    temp: "hot",
    milk: null,
    sweetness: "regular",
    ice_level: "regular",
    add_ons: [],
    item_price: pastry.price,
    special_instructions: null,
  };
}

type Structure = "1d" | "1d1p" | "2d" | "2d1p";

function makeItems(): ItemRow[] {
  const structure = weighted<Structure>(
    ["1d", "1d1p", "2d", "2d1p"],
    [60, 25, 10, 5]
  );
  const cat = (): "coffee" | "tea" =>
    Math.random() < 0.80 ? "coffee" : "tea";

  switch (structure) {
    case "1d":   return [makeDrink(cat())];
    case "1d1p": return [makeDrink(cat()), makePastry()];
    case "2d":   return [makeDrink(cat()), makeDrink(cat())];
    case "2d1p": return [makeDrink(cat()), makeDrink(cat()), makePastry()];
  }
}

// ── Names & schedule ──────────────────────────────────────────────────────────

const NAMES = [
  "Sarah", "Mike", "Jess", "David", "Emma", "Chris", "Olivia", "James",
  "Sofia", "Marcus", "Rachel", "Tyler", "Nina", "Alex", "Priya", "Ben",
  "Maria", "Kevin", "Aisha", "Tom", "Lauren", "Derek", "Mei", "Jordan", "Sam",
];

// Orders per day: [today, yesterday, -2 days, -3 days, -4 days]
// Today is busiest (Friday rush); Mon also heavy
const DAILY = [12, 10, 8, 9, 11];

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
  const shouldClear = process.argv.includes("--clear");

  if (shouldClear) {
    console.log("🗑   Clearing existing orders…");
    const { error: e1 } = await db
      .from("order_items")
      .delete()
      .not("id", "is", null);
    if (e1) {
      console.error("Failed to clear order_items:", e1.message);
      process.exit(1);
    }
    const { error: e2 } = await db
      .from("orders")
      .delete()
      .not("id", "is", null);
    if (e2) {
      console.error("Failed to clear orders:", e2.message);
      process.exit(1);
    }
    console.log("    Cleared.\n");
  } else {
    const { data: existing } = await db.from("orders").select("id").limit(1);
    if (existing && existing.length > 0) {
      console.log(
        "Seed data already exists.\n" +
          "Run with --clear to reset:\n" +
          "  npx tsx scripts/seed-orders.ts --clear"
      );
      process.exit(0);
    }
  }

  // Determine next order number (continues from any existing data)
  const { data: latest } = await db
    .from("orders")
    .select("order_number")
    .order("order_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  let nextNum =
    ((latest as { order_number: number } | null)?.order_number ?? 0) + 1;

  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);

  const totalOrders = DAILY.reduce((s, n) => s + n, 0);
  let inserted = 0;

  for (let dayOff = 0; dayOff < DAILY.length; dayOff++) {
    const count   = DAILY[dayOff];
    const isToday = dayOff === 0;
    const day     = new Date(todayMidnight);
    day.setDate(day.getDate() - dayOff);

    const slots = makeSlots(count);

    // Generate all orders for this day, then sort chronologically
    // so that status assignment (completed → in_progress → new) makes sense
    const dayOrders = Array.from({ length: count }, (_, i) => ({
      time:  slotTime(day, slots[i]),
      items: makeItems(),
      name:  pick(NAMES),
    })).sort((a, b) => a.time.getTime() - b.time.getTime());

    for (let i = 0; i < count; i++) {
      const { time, items, name } = dayOrders[i];
      const orderNum = nextNum++;

      // ── Status & timestamps ──────────────────────────────────────────────
      let status: "new" | "in_progress" | "completed";
      let started_at: string | null = null;
      let completed_at: string | null = null;

      if (!isToday) {
        // Previous days → all completed
        status = "completed";
        const s = addMins(time, randInt(1, 3));
        const c = addMins(s,    randInt(2, 5));
        started_at   = s.toISOString();
        completed_at = c.toISOString();
      } else {
        // Today: earliest 6 completed, next 2 in_progress, last 4 new
        if (i < 6) {
          status = "completed";
          const s = addMins(time, randInt(1, 3));
          const c = addMins(s,    randInt(2, 5));
          started_at   = s.toISOString();
          completed_at = c.toISOString();
        } else if (i < 8) {
          status = "in_progress";
          started_at = addMins(time, randInt(1, 3)).toISOString();
        } else {
          status = "new";
        }
      }

      const total_price =
        Math.round(items.reduce((s, it) => s + it.item_price, 0) * 100) / 100;

      // Console label
      const first = items[0];
      const tempLabel = first.temp === "iced" ? "Iced " : "";
      const sizeLabel = first.size === "large" ? "Large" : "Small";
      console.log(
        `Inserting order ${inserted + 1}/${totalOrders}… ` +
          `#${String(orderNum).padStart(3, "0")} ${name} - ${sizeLabel} ${tempLabel}${first.item_name}`
      );

      // ── Insert order row ─────────────────────────────────────────────────
      const { data: ord, error: oe } = await db
        .from("orders")
        .insert({
          order_number:  orderNum,
          customer_name: name,
          status,
          total_price,
          created_at:  time.toISOString(),
          started_at,
          completed_at,
        })
        .select("id")
        .single();

      if (oe || !ord) {
        console.error(`  ✗ Order insert failed: ${oe?.message}`);
        continue;
      }

      const orderId = (ord as { id: string }).id;

      // ── Insert order_items rows ──────────────────────────────────────────
      const { error: ie } = await db.from("order_items").insert(
        items.map((it) => ({
          order_id:             orderId,
          item_name:            it.item_name,
          size:                 it.size,
          temp:                 it.temp,
          milk:                 it.milk,
          sweetness:            it.sweetness,
          ice_level:            it.ice_level,
          add_ons:              it.add_ons,
          item_price:           it.item_price,
          special_instructions: it.special_instructions,
        }))
      );

      if (ie) {
        console.error(`  ✗ Items insert failed: ${ie.message}`);
      } else {
        inserted++;
      }
    }
  }

  console.log(`\n✅  Seeded ${inserted}/${totalOrders} orders successfully.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
