"use client";

// src/components/chat/MenuDrawer.tsx
// ============================================================
// Collapsible menu drawer triggered by the "View Menu" button.
// Slides in from the right as an overlay panel.
// Pulls all data from src/lib/menu.ts — nothing hardcoded.
// Each drink / pastry is tappable: fires onSelectItem(name).
// ============================================================

import { useEffect } from "react";
import { X } from "lucide-react";
import {
  DRINKS,
  PASTRIES,
  MILK_OPTIONS,
  ADD_ONS,
  SWEETNESS_LEVELS,
  ICE_LEVELS,
} from "@/lib/menu";

interface MenuDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Called with the item name when a customer taps a drink or pastry. */
  onSelectItem?: (itemName: string) => void;
}

export function MenuDrawer({ open, onClose, onSelectItem }: MenuDrawerProps) {
  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Prevent body scroll while drawer is open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const coffeeDrinks = DRINKS.filter((d) => d.category === "coffee");
  const teaDrinks = DRINKS.filter((d) => d.category === "tea");

  /** Close drawer then notify parent — order matters so the drawer animates out. */
  const handleSelect = (name: string) => {
    onClose();
    onSelectItem?.(name);
  };

  // Shared classes for tappable drink / pastry rows
  const tappableRow =
    "w-full text-left flex justify-between items-start gap-3 px-2 -mx-2 py-1.5 rounded-lg transition-colors " +
    (onSelectItem
      ? "cursor-pointer hover:bg-amber-50 active:bg-amber-100"
      : "");

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className={`fixed top-0 right-0 z-50 h-full w-80 max-w-[90vw] bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Drawer header */}
        <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-stone-200">
          <h2 className="font-serif-display text-lg text-stone-900 leading-none">
            Menu
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="flex items-center justify-center w-8 h-8 text-stone-400 hover:text-stone-700 rounded-md"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable menu content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

          {/* ---- Coffee ---- */}
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400 mb-3">
              Coffee
            </p>
            <div className="space-y-1">
              {coffeeDrinks.map((drink) => (
                <button
                  key={drink.name}
                  type="button"
                  onClick={() => handleSelect(drink.name)}
                  className={tappableRow}
                  aria-label={`Order ${drink.name}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] text-stone-800 font-medium leading-snug">
                      {drink.name}
                    </p>
                    <p className="text-[12px] text-stone-400 mt-0.5 capitalize">
                      {drink.temps.join(" · ")}
                      {drink.isBlended ? " · blended" : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[13px] text-stone-600">
                      S&nbsp;&nbsp;${drink.sizes.small.toFixed(2)}
                    </p>
                    <p className="text-[13px] text-stone-600">
                      L&nbsp;&nbsp;${drink.sizes.large.toFixed(2)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <div className="border-t border-stone-100" />

          {/* ---- Tea ---- */}
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400 mb-3">
              Tea
            </p>
            <div className="space-y-1">
              {teaDrinks.map((drink) => (
                <button
                  key={drink.name}
                  type="button"
                  onClick={() => handleSelect(drink.name)}
                  className={tappableRow}
                  aria-label={`Order ${drink.name}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] text-stone-800 font-medium leading-snug">
                      {drink.name}
                    </p>
                    <p className="text-[12px] text-stone-400 mt-0.5 capitalize">
                      {drink.temps.join(" · ")}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[13px] text-stone-600">
                      S&nbsp;&nbsp;${drink.sizes.small.toFixed(2)}
                    </p>
                    <p className="text-[13px] text-stone-600">
                      L&nbsp;&nbsp;${drink.sizes.large.toFixed(2)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <div className="border-t border-stone-100" />

          {/* ---- Pastries ---- */}
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400 mb-3">
              Pastries
            </p>
            <div className="space-y-1">
              {PASTRIES.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => handleSelect(item.name)}
                  className={tappableRow}
                  aria-label={`Order ${item.name}`}
                >
                  <p className="text-[14px] text-stone-800">{item.name}</p>
                  <p className="text-[13px] text-stone-600">${item.price.toFixed(2)}</p>
                </button>
              ))}
            </div>
          </section>

          <div className="border-t border-stone-100" />

          {/* ---- Milk options — informational only ---- */}
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400 mb-3">
              Milk Options
            </p>
            <div className="space-y-2">
              {MILK_OPTIONS.map((m) => (
                <div key={m.name} className="flex justify-between items-center gap-3">
                  <p className="text-[14px] text-stone-800">{m.label}</p>
                  <p className="text-[13px] text-stone-500">
                    {m.upcharge === 0 ? "free" : `+$${m.upcharge.toFixed(2)}`}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <div className="border-t border-stone-100" />

          {/* ---- Add-ons — informational only ---- */}
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400 mb-3">
              Add-Ons
            </p>
            <div className="space-y-2">
              {ADD_ONS.map((addon) => (
                <div key={addon.name} className="flex justify-between items-center gap-3">
                  <div className="flex-1">
                    <p className="text-[14px] text-stone-800">{addon.name}</p>
                    <p className="text-[12px] text-stone-400">max {addon.maxQty}</p>
                  </div>
                  <p className="text-[13px] text-stone-600 shrink-0">
                    +${addon.price.toFixed(2)} each
                  </p>
                </div>
              ))}
            </div>
          </section>

          <div className="border-t border-stone-100" />

          {/* ---- Sweetness & Ice — informational only ---- */}
          <section className="pb-6">
            <div className="space-y-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400 mb-1">
                  Sweetness
                </p>
                <p className="text-[13px] text-stone-500 capitalize">
                  {SWEETNESS_LEVELS.join(" · ")}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400 mb-1">
                  Ice Level
                </p>
                <p className="text-[13px] text-stone-500 capitalize">
                  {ICE_LEVELS.join(" · ")}
                </p>
              </div>
            </div>
          </section>

        </div>
      </div>
    </>
  );
}
