#!/usr/bin/env node
/**
 * scripts/seed-feb-2425.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Seeds 50 orders for 2/24/2026 (25 orders) and 2/25/2026 (25 orders).
 * Inserts into Supabase and appends rows to orders.csv / orders_detailed.csv.
 *
 * Run from the repo root (where .env.local lives):
 *   npx tsx scripts/seed-feb-2425.ts
 *   npx tsx scripts/seed-feb-2425.ts --no-csv   (skip CSV writing)
 */

import path from "path";
import fs from "fs";

// Load .env.local without dotenv dependency
(function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
})();

import { createClient } from "@supabase/supabase-js";
import { DRINKS, MILK_OPTIONS, PASTRIES } from "../src/lib/menu";

// ── Paths ─────────────────────────────────────────────────────────────────────

const PROJECT_ROOT = path.resolve(__dirname, "..");
const SUMMARY_CSV  = path.join(PROJECT_ROOT, "orders.csv");
const DETAILED_CSV = path.join(PROJECT_ROOT, "orders_detailed.csv");

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

function slotTime(baseDate: Date, slot: Slot): Date {
  const midnight = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate()
  );
  const ranges: Record<Slot, [number, number]> = {
    morning:   [7 * 60,  9 * 60 - 1],
    midday:    [11 * 60, 13 * 60 - 1],
    afternoon: [14 * 60, 17 * 60 - 1],
    evening:   [17 * 60, 20 * 60 - 1],
  };
  const [lo, hi] = ranges[slot];
  return new Date(midnight.getTime() + randInt(lo, hi) * 60_000);
}

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
      const qty = randInt(1, 2);
      add_ons.push({ name: "Extra Espresso Shot", qty, unit_price: 1.50 });
      price += qty * 1.50;
    } else if (r < 0.70) {
      const qty = randInt(1, 3);
      add_ons.push({ name: "Caramel Syrup", qty, unit_price: 0.50 });
      price += qty * 0.50;
    } else {
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

// ── CSV helpers ───────────────────────────────────────────────────────────────

function csvEscape(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(...fields: (string | number | null | undefined)[]): string {
  return fields.map(csvEscape).join(",");
}

const PASTRY_NAMES = new Set(PASTRIES.map((p) => p.name));

function formatItemSummary(item: ItemRow): string {
  if (PASTRY_NAMES.has(item.item_name)) return item.item_name;

  const size = item.size === "large" ? "Large" : "Small";
  const temp = item.temp === "iced" ? "Iced " : "Hot ";
  let desc = `${size} ${temp}${item.item_name}`;

  const mods: string[] = [];
  if (item.milk) mods.push(`${item.milk} milk`);
  for (const ao of item.add_ons) {
    mods.push(`+${ao.qty} ${ao.name}`);
  }

  if (mods.length > 0) desc += ` (${mods.join(", ")})`;
  return desc;
}

function formatAddOnsDetailed(add_ons: AddOnRow[]): string {
  if (!add_ons.length) return "";
  return add_ons.map((ao) => `${ao.name} x${ao.qty}`).join("; ");
}

// ── Names ─────────────────────────────────────────────────────────────────────

const NAMES = [
  "Sarah", "Mike", "Jess", "David", "Emma", "Chris", "Olivia", "James",
  "Sofia", "Marcus", "Rachel", "Tyler", "Nina", "Alex", "Priya", "Ben",
  "Maria", "Kevin", "Aisha", "Tom", "Lauren", "Derek", "Mei", "Jordan", "Sam",
];

// ── Schedule ──────────────────────────────────────────────────────────────────

// 25 orders on 2/24 (today), 25 on 2/25 (tomorrow)
const SCHEDULE = [
  { date: new Date(2026, 1, 24), count: 25, isFuture: false },
  { date: new Date(2026, 1, 25), count: 25, isFuture: true  },
];

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
  const skipCsv = process.argv.includes("--no-csv");

  // Determine next order number (continues from any existing data)
  const { data: latest } = await db
    .from("orders")
    .select("order_number")
    .order("order_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  let nextNum =
    ((latest as { order_number: number } | null)?.order_number ?? 0) + 1;

  console.log(`\nStarting from order #${nextNum}\n`);

  // Prepare CSV writers
  let summaryLines: string[] = [];
  let detailedLines: string[] = [];

  if (!skipCsv) {
    // If files don't exist yet, write headers
    if (!fs.existsSync(SUMMARY_CSV)) {
      summaryLines.push(
        "order_number,customer_name,status,total_price,created_at,started_at,completed_at,items"
      );
    }
    if (!fs.existsSync(DETAILED_CSV)) {
      detailedLines.push(
        "order_number,customer_name,order_status,order_total,order_created_at,item_name,size,temp,milk,sweetness,ice_level,add_ons,item_price,special_instructions"
      );
    }
  }

  const totalOrders = SCHEDULE.reduce((s, d) => s + d.count, 0);
  let inserted = 0;

  for (const { date, count, isFuture } of SCHEDULE) {
    const dateLabel = date.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" });
    console.log(`\n── ${dateLabel} (${count} orders) ──────────────`);

    const slots = makeSlots(count);

    const dayOrders = Array.from({ length: count }, (_, i) => ({
      time:  slotTime(date, slots[i]),
      items: makeItems(),
      name:  pick(NAMES),
    })).sort((a, b) => a.time.getTime() - b.time.getTime());

    for (let i = 0; i < count; i++) {
      const { time, items, name } = dayOrders[i];
      const orderNum = nextNum++;

      // Status assignment
      let status: "new" | "in_progress" | "completed";
      let started_at: string | null = null;
      let completed_at: string | null = null;

      if (isFuture) {
        // Tomorrow: all new
        status = "new";
      } else {
        // Today (2/24): first 17 completed, next 4 in_progress, last 4 new
        if (i < 17) {
          status = "completed";
          const s = addMins(time, randInt(1, 3));
          const c = addMins(s,    randInt(2, 5));
          started_at   = s.toISOString();
          completed_at = c.toISOString();
        } else if (i < 21) {
          status = "in_progress";
          started_at = addMins(time, randInt(1, 3)).toISOString();
        } else {
          status = "new";
        }
      }

      const total_price =
        Math.round(items.reduce((s, it) => s + it.item_price, 0) * 100) / 100;

      const first = items[0];
      const sizeLabel = first.size === "large" ? "Large" : "Small";
      const tempLabel = first.temp === "iced" ? "Iced " : "";
      console.log(
        `  Inserting ${inserted + 1}/${totalOrders}… ` +
          `#${String(orderNum).padStart(3, "0")} ${name.padEnd(8)} ` +
          `${status.padEnd(11)} ${sizeLabel} ${tempLabel}${first.item_name}`
      );

      // Insert order
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

      // Insert order_items
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
        continue;
      }

      inserted++;

      // Build CSV rows
      if (!skipCsv) {
        // Summary CSV
        const itemsSummary = items.map(formatItemSummary).join("; ");
        summaryLines.push(
          csvRow(
            orderNum,
            name,
            status,
            total_price,
            time.toISOString(),
            started_at,
            completed_at,
            itemsSummary
          )
        );

        // Detailed CSV
        for (const it of items) {
          detailedLines.push(
            csvRow(
              orderNum,
              name,
              status,
              total_price,
              time.toISOString(),
              it.item_name,
              it.size,
              it.temp,
              it.milk,
              it.sweetness,
              it.ice_level,
              formatAddOnsDetailed(it.add_ons),
              it.item_price,
              it.special_instructions
            )
          );
        }
      }
    }
  }

  // Write CSV files
  if (!skipCsv && (summaryLines.length > 0 || detailedLines.length > 0)) {
    if (summaryLines.length > 0) {
      // Ensure existing file ends with a newline before appending
      const summaryPrefix =
        fs.existsSync(SUMMARY_CSV) &&
        !fs.readFileSync(SUMMARY_CSV).toString().endsWith("\n")
          ? "\n"
          : "";
      fs.appendFileSync(SUMMARY_CSV, summaryPrefix + summaryLines.join("\n") + "\n");
      console.log(`\n📄  Appended ${summaryLines.filter(l => !l.startsWith("order_number")).length} rows → ${SUMMARY_CSV}`);
    }
    if (detailedLines.length > 0) {
      const detailedPrefix =
        fs.existsSync(DETAILED_CSV) &&
        !fs.readFileSync(DETAILED_CSV).toString().endsWith("\n")
          ? "\n"
          : "";
      fs.appendFileSync(DETAILED_CSV, detailedPrefix + detailedLines.join("\n") + "\n");
      console.log(`📄  Appended ${detailedLines.filter(l => !l.startsWith("order_number")).length} rows → ${DETAILED_CSV}`);
    }
  }

  console.log(`\n✅  Seeded ${inserted}/${totalOrders} orders successfully.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
