// src/lib/menu.ts
// ============================================================
// NYC Coffee — Complete Menu Definition
// Source of truth for AI system prompt, menu drawer, and pricing
// ============================================================

// ----------------- Types -----------------

export type Size = "small" | "large";
export type Temperature = "hot" | "iced";
export type MilkOption = "whole" | "skim" | "oat" | "almond";
export type SweetnessLevel = "no sugar" | "less sugar" | "regular" | "extra sugar";
export type IceLevel = "no ice" | "less ice" | "regular" | "extra ice";
export type DrinkCategory = "coffee" | "tea";

export interface DrinkItem {
  name: string;
  category: DrinkCategory;
  sizes: { small: number; large: number };
  temps: Temperature[];        // allowed temperatures
  defaultTemp: Temperature;
  hasMilk: boolean;            // whether the drink naturally contains milk
  hasEspresso: boolean;        // whether espresso shots can be added
  hasMatcha: boolean;          // whether matcha shots can be added
  isBlended: boolean;          // frappuccinos — no ice level adjustments
}

export interface AddOn {
  name: string;
  price: number;
  maxQty: number;
  applicableTo: "milk-drinks" | "espresso-drinks" | "matcha-drinks" | "any";
}

export interface PastryItem {
  name: string;
  price: number;
}

// ----------------- Drinks -----------------

export const DRINKS: DrinkItem[] = [
  // ---- Coffee ----
  {
    name: "Americano",
    category: "coffee",
    sizes: { small: 3.0, large: 4.0 },
    temps: ["hot", "iced"],
    defaultTemp: "hot",
    hasMilk: false,       // black by default; milk can be added as a modifier
    hasEspresso: true,
    hasMatcha: false,
    isBlended: false,
  },
  {
    name: "Latte",
    category: "coffee",
    sizes: { small: 4.0, large: 5.0 },
    temps: ["hot", "iced"],
    defaultTemp: "hot",
    hasMilk: true,
    hasEspresso: true,
    hasMatcha: false,
    isBlended: false,
  },
  {
    name: "Cold Brew",
    category: "coffee",
    sizes: { small: 4.0, large: 5.0 },
    temps: ["iced"],          // iced only
    defaultTemp: "iced",
    hasMilk: false,
    hasEspresso: true,        // can add a shot to cold brew
    hasMatcha: false,
    isBlended: false,
  },
  {
    name: "Mocha",
    category: "coffee",
    sizes: { small: 4.5, large: 5.5 },
    temps: ["hot", "iced"],
    defaultTemp: "hot",
    hasMilk: true,
    hasEspresso: true,
    hasMatcha: false,
    isBlended: false,
  },
  {
    name: "Coffee Frappuccino",
    category: "coffee",
    sizes: { small: 5.5, large: 6.0 },
    temps: ["iced"],          // iced/blended only — cannot be made hot
    defaultTemp: "iced",
    hasMilk: true,
    hasEspresso: true,
    hasMatcha: false,
    isBlended: true,          // blended drink — ice level doesn't apply
  },

  // ---- Tea ----
  {
    name: "Black Tea",
    category: "tea",
    sizes: { small: 3.0, large: 3.75 },
    temps: ["hot", "iced"],
    defaultTemp: "hot",
    hasMilk: false,
    hasEspresso: false,
    hasMatcha: false,
    isBlended: false,
  },
  {
    name: "Jasmine Tea",
    category: "tea",
    sizes: { small: 3.0, large: 3.75 },
    temps: ["hot", "iced"],
    defaultTemp: "hot",
    hasMilk: false,
    hasEspresso: false,
    hasMatcha: false,
    isBlended: false,
  },
  {
    name: "Lemon Green Tea",
    category: "tea",
    sizes: { small: 3.5, large: 4.25 },
    temps: ["hot", "iced"],
    defaultTemp: "hot",
    hasMilk: false,           // citrus + milk = curdling, see RULES below
    hasEspresso: false,
    hasMatcha: false,
    isBlended: false,
  },
  {
    name: "Matcha Latte",
    category: "tea",
    sizes: { small: 4.5, large: 5.25 },
    temps: ["hot", "iced"],
    defaultTemp: "hot",
    hasMilk: true,
    hasEspresso: false,       // no espresso in matcha (it's a tea latte)
    hasMatcha: true,          // extra matcha shots allowed
    isBlended: false,
  },
];

// ----------------- Add-Ons / Substitutions -----------------

export const MILK_OPTIONS: { name: MilkOption; label: string; upcharge: number }[] = [
  { name: "whole", label: "Whole Milk", upcharge: 0.0 },
  { name: "skim", label: "Skim Milk", upcharge: 0.0 },
  { name: "oat", label: "Oat Milk", upcharge: 0.5 },
  { name: "almond", label: "Almond Milk", upcharge: 0.75 },
];

export const ADD_ONS: AddOn[] = [
  {
    name: "Extra Espresso Shot",
    price: 1.5,
    maxQty: 5,                 // sensible max: 5 extra (≈6 total w/ base shot)
    applicableTo: "espresso-drinks",
  },
  {
    name: "Extra Matcha Shot",
    price: 1.5,
    maxQty: 3,                 // sensible max: 3 extra
    applicableTo: "matcha-drinks",
  },
  {
    name: "Caramel Syrup",
    price: 0.5,
    maxQty: 6,                 // sensible max pumps
    applicableTo: "any",
  },
  {
    name: "Hazelnut Syrup",
    price: 0.5,
    maxQty: 6,
    applicableTo: "any",
  },
];

// ----------------- Pastries -----------------

export const PASTRIES: PastryItem[] = [
  { name: "Plain Croissant", price: 3.5 },
  { name: "Chocolate Croissant", price: 4.0 },
  { name: "Chocolate Chip Cookie", price: 2.5 },
  { name: "Banana Bread", price: 3.0 },
];

// ----------------- Sweetness & Ice -----------------

export const SWEETNESS_LEVELS: SweetnessLevel[] = [
  "no sugar",
  "less sugar",
  "regular",     // default — not listed on menu but implied
  "extra sugar",
];

export const ICE_LEVELS: IceLevel[] = [
  "no ice",
  "less ice",
  "regular",     // default
  "extra ice",
];

// =============================================================
// VALIDATION RULES & EDGE CASES
// =============================================================
// These rules should be embedded in the AI system prompt AND
// enforced server-side when an order is submitted.
// =============================================================

export const VALIDATION_RULES = {
  // ---- Temperature rules ----
  temperature: {
    rule: "Each drink has allowed temperatures defined in `temps`. Reject requests outside that list.",
    examples: [
      "Coffee Frappuccino CANNOT be made hot — it's a blended iced drink.",
      "Cold Brew CANNOT be made hot — it's a cold extraction process.",
      "All other drinks can be hot or iced.",
    ],
  },

  // ---- Milk rules ----
  milk: {
    rule: "Milk substitutions only apply to drinks that contain milk (`hasMilk: true`). For non-milk drinks, milk can be ADDED but should be clarified.",
    examples: [
      "Latte, Mocha, Matcha Latte, Frappuccino → milk sub is a swap (e.g. 'oat milk latte').",
      "Americano → adding milk is fine but should be noted as 'with milk' (splash of milk, not a latte).",
      "Black Tea, Jasmine Tea → milk can be added, but clarify it's unusual.",
      "Lemon Green Tea → milk should be REJECTED. Citrus + milk curdles.",
      "Cold Brew → milk/cream can be added as a modifier.",
    ],
  },

  // ---- Espresso shot rules ----
  espresso: {
    rule: "Extra espresso shots can only be added to espresso-based drinks (`hasEspresso: true`). Max 5 extra shots.",
    examples: [
      "Americano, Latte, Mocha, Cold Brew, Frappuccino → extra shots OK.",
      "Black Tea, Jasmine Tea, Lemon Green Tea → espresso shots REJECTED.",
      "Matcha Latte → espresso shots REJECTED (use extra matcha shot instead).",
      "More than 5 extra shots → REJECTED ('That's a lot of caffeine! We max out at 5 extra shots.').",
    ],
  },

  // ---- Matcha shot rules ----
  matcha: {
    rule: "Extra matcha shots only apply to Matcha Latte. Max 3 extra.",
    examples: [
      "Adding matcha to a Latte or Americano → REJECTED (suggest ordering a Matcha Latte instead).",
    ],
  },

  // ---- Ice level rules ----
  iceLevel: {
    rule: "Ice level adjustments only apply to ICED drinks that are NOT blended.",
    examples: [
      "Hot drinks → ice level REJECTED ('That's a hot drink — would you like it iced instead?').",
      "Coffee Frappuccino → ice level REJECTED ('Frappuccinos are blended, so we can't adjust ice level.').",
      "Iced Latte, Iced Americano, Cold Brew, etc. → ice level adjustments OK.",
    ],
  },

  // ---- Sweetness rules ----
  sweetness: {
    rule: "Sweetness level applies to ALL drinks. Default is 'regular' (standard recipe).",
    examples: [
      "Any drink can be no sugar, less sugar, regular, or extra sugar.",
      "For teas, this controls how much simple syrup is added.",
      "For coffee drinks, this controls sugar/sweetener added.",
    ],
  },

  // ---- Syrup rules ----
  syrups: {
    rule: "Caramel and hazelnut syrup can be added to ANY drink. Max 6 pumps each.",
    examples: [
      "Caramel syrup in a Latte → OK.",
      "Hazelnut syrup in a Black Tea → OK (unusual but allowed).",
      "10 pumps of caramel → REJECTED (max 6 pumps).",
    ],
  },

  // ---- Nonsensical / impossible orders ----
  impossible: {
    rule: "Reject orders that are logically impossible or result in a non-drink.",
    examples: [
      "'Latte with no milk and no espresso' → REJECTED (that's just a cup of nothing).",
      "'Latte with no espresso' → WARN ('That would just be steamed milk. Would you like a Matcha Latte or something else instead?').",
      "'Latte with no milk' → CLARIFY ('That would be espresso shots in a cup. Did you mean an Americano?').",
      "'Decaf cold brew' → REJECTED (cold brew is a specific process, can't be decaf).",
      "'Hot cold brew' → REJECTED (contradictory).",
      "'Extra ice on a hot drink' → REJECTED (offer iced version instead).",
    ],
  },

  // ---- Pastry rules ----
  pastries: {
    rule: "Pastries have no customization. They are what they are.",
    examples: [
      "'Warm up my croissant' → OK (reasonable request, note it on the ticket).",
      "'Croissant with oat milk' → REJECTED (that's not a thing).",
      "'Half a cookie' → REJECTED (we sell whole items only).",
    ],
  },

  // ---- Quantity limits ----
  quantity: {
    rule: "Reasonable per-item limits per order.",
    examples: [
      "Max 10 drinks per order (likely ordering for a group — that's fine).",
      "Max 10 pastries per order.",
      "More than 10 of anything → CLARIFY ('That's a big order! Just confirming — you'd like 12 lattes?').",
      "More than 20 → REJECTED ('For catering orders of 20+, please call us directly at 212-535-7367.').",
    ],
  },

  // ---- Off-menu / unavailable items ----
  offMenu: {
    rule: "Politely decline items not on the menu and suggest alternatives.",
    examples: [
      "'Can I get a cappuccino?' → 'We don't have cappuccino on our menu, but our Latte is similar! Would you like to try that?'",
      "'Do you have food?' → 'We have pastries! We've got croissants, a chocolate chip cookie, and banana bread.'",
      "'Can I get a smoothie?' → 'Sorry, we don't offer smoothies. Our Coffee Frappuccino is our blended option if you're interested!'",
      "'Can I get a beer?' → 'Ha! We're just a coffee shop — but I can get you something caffeinated!'",
    ],
  },
};

// =============================================================
// HELPER: Build the full menu as plain text for AI system prompt
// =============================================================

export function getMenuAsText(): string {
  let text = `NYC COFFEE — FULL MENU\n`;
  text += `512 West 43rd Street, New York, NY | Tel: 212-535-7367\n`;
  text += `${"=".repeat(60)}\n\n`;

  text += `☕ COFFEE\n`;
  text += `${"─".repeat(40)}\n`;
  for (const d of DRINKS.filter((d) => d.category === "coffee")) {
    const temps = d.temps.join("/");
    text += `  ${d.name} (${temps}) — Small $${d.sizes.small.toFixed(2)} | Large $${d.sizes.large.toFixed(2)}\n`;
  }

  text += `\n🍵 TEA\n`;
  text += `${"─".repeat(40)}\n`;
  for (const d of DRINKS.filter((d) => d.category === "tea")) {
    const temps = d.temps.join("/");
    text += `  ${d.name} (${temps}) — Small $${d.sizes.small.toFixed(2)} | Large $${d.sizes.large.toFixed(2)}\n`;
  }

  text += `\n⭐ ADD-ONS / SUBSTITUTIONS\n`;
  text += `${"─".repeat(40)}\n`;
  text += `  Milk options: Whole (free), Skim (free), Oat (+$0.50), Almond (+$0.75)\n`;
  text += `  Extra Espresso Shot — $1.50 each (max 5 extra)\n`;
  text += `  Extra Matcha Shot — $1.50 each (max 3 extra)\n`;
  text += `  Caramel Syrup — $0.50/pump (max 6 pumps)\n`;
  text += `  Hazelnut Syrup — $0.50/pump (max 6 pumps)\n`;

  text += `\n🧁 PASTRIES\n`;
  text += `${"─".repeat(40)}\n`;
  for (const p of PASTRIES) {
    text += `  ${p.name} — $${p.price.toFixed(2)}\n`;
  }

  text += `\n🧊 ICE LEVELS (iced drinks only, not blended): No Ice | Less Ice | Regular | Extra Ice\n`;
  text += `🍬 SWEETNESS LEVELS: No Sugar | Less Sugar | Regular | Extra Sugar\n`;

  return text;
}

// =============================================================
// HELPER: Build validation rules as plain text for AI prompt
// =============================================================

export function getRulesAsText(): string {
  let text = `ORDER VALIDATION RULES\n`;
  text += `${"=".repeat(60)}\n\n`;

  for (const [key, val] of Object.entries(VALIDATION_RULES)) {
    text += `[${key.toUpperCase()}]\n`;
    text += `Rule: ${val.rule}\n`;
    for (const ex of val.examples) {
      text += `  • ${ex}\n`;
    }
    text += `\n`;
  }

  return text;
}

// =============================================================
// HELPER: Price calculator for a single drink order
// =============================================================

export interface DrinkOrder {
  drinkName: string;
  size: Size;
  temp: Temperature;
  milk?: MilkOption;
  sweetness?: SweetnessLevel;
  iceLevel?: IceLevel;
  extraEspressoShots?: number;
  extraMatchaShots?: number;
  caramelSyrupPumps?: number;
  hazelnutSyrupPumps?: number;
  specialInstructions?: string;
}

export function calculateDrinkPrice(order: DrinkOrder): number {
  const drink = DRINKS.find(
    (d) => d.name.toLowerCase() === order.drinkName.toLowerCase()
  );
  if (!drink) throw new Error(`Unknown drink: ${order.drinkName}`);

  let price = drink.sizes[order.size];

  // Milk upcharge (only if substituting from default whole milk)
  if (order.milk) {
    const milkOpt = MILK_OPTIONS.find((m) => m.name === order.milk);
    if (milkOpt) price += milkOpt.upcharge;
  }

  // Extra espresso shots
  if (order.extraEspressoShots && order.extraEspressoShots > 0) {
    price += order.extraEspressoShots * 1.5;
  }

  // Extra matcha shots
  if (order.extraMatchaShots && order.extraMatchaShots > 0) {
    price += order.extraMatchaShots * 1.5;
  }

  // Syrups
  if (order.caramelSyrupPumps && order.caramelSyrupPumps > 0) {
    price += order.caramelSyrupPumps * 0.5;
  }
  if (order.hazelnutSyrupPumps && order.hazelnutSyrupPumps > 0) {
    price += order.hazelnutSyrupPumps * 0.5;
  }

  return Math.round(price * 100) / 100; // avoid floating point weirdness
}
