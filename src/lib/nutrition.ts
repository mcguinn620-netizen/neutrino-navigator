// Nutrition parsing + aggregation helpers.
// Source nutrient values look like "240", "12 g", "320 mg", "5 %".

export type NutrientMap = Record<string, string | number | null | undefined>;

export interface ParsedNutrient {
  value: number;
  unit: string; // "", "g", "mg", "%", "kcal", etc.
}

export const parseNutrient = (raw: unknown): ParsedNutrient | null => {
  if (raw === null || raw === undefined || raw === "") return null;
  const s = String(raw).trim();
  // Match leading number (allow decimals, leading minus, "<")
  const m = s.match(/^[<>~]?\s*(-?\d+(?:\.\d+)?)\s*([a-zA-Z%]*)/);
  if (!m) return null;
  const value = parseFloat(m[1]);
  if (Number.isNaN(value)) return null;
  return { value, unit: (m[2] || "").toLowerCase() };
};

export const formatNutrient = (value: number, unit: string): string => {
  const v = Math.round(value * 10) / 10;
  const display = Number.isInteger(v) ? String(v) : v.toFixed(1);
  if (!unit) return display;
  return `${display} ${unit}`;
};

// Standard macro keys we display prominently
export const MACRO_KEYS = {
  calories: ["Calories", "calories", "Cal"],
  protein: ["Protein"],
  carbs: ["Total Carbohydrate", "Carbohydrates", "Carbs"],
  fat: ["Total Fat", "Fat"],
} as const;

export const findNutrient = (
  nutrients: NutrientMap | null | undefined,
  keys: readonly string[],
): ParsedNutrient | null => {
  if (!nutrients) return null;
  for (const k of keys) {
    if (k in nutrients) {
      const p = parseNutrient(nutrients[k]);
      if (p) return p;
    }
  }
  // Case-insensitive fallback
  const lcKeys = Object.keys(nutrients).reduce<Record<string, string>>(
    (acc, key) => ((acc[key.toLowerCase()] = key), acc),
    {},
  );
  for (const k of keys) {
    const realKey = lcKeys[k.toLowerCase()];
    if (realKey) {
      const p = parseNutrient(nutrients[realKey]);
      if (p) return p;
    }
  }
  return null;
};

export interface AggregatedNutrients {
  // For each canonical label -> { value, unit }
  totals: Record<string, ParsedNutrient>;
}

const NON_NUMERIC_KEYS = new Set(["ingredients"]);

// Aggregate any number of nutrient maps. Sums values per label, preserving unit.
// Skips Ingredients and any non-numeric values. Quantity multiplier supported.
export const aggregateNutrients = (
  items: { nutrients: NutrientMap | null | undefined; quantity?: number }[],
): AggregatedNutrients => {
  const totals: Record<string, { value: number; unit: string }> = {};
  for (const item of items) {
    const qty = item.quantity ?? 1;
    if (!item.nutrients) continue;
    for (const [label, raw] of Object.entries(item.nutrients)) {
      if (NON_NUMERIC_KEYS.has(label.toLowerCase())) continue;
      const parsed = parseNutrient(raw);
      if (!parsed) continue;
      // Skip percentage values from aggregation (DV % doesn't sum meaningfully)
      if (parsed.unit === "%") continue;
      const existing = totals[label];
      if (existing && existing.unit !== parsed.unit) continue; // unit mismatch -> skip
      totals[label] = {
        value: (existing?.value ?? 0) + parsed.value * qty,
        unit: existing?.unit ?? parsed.unit,
      };
    }
  }
  return { totals };
};

// Rank micros: any aggregated key NOT in macro list. Returns sorted by relevance order.
const MICRO_PRIORITY = [
  "Saturated Fat",
  "Trans Fat",
  "Cholesterol",
  "Sodium",
  "Dietary Fiber",
  "Fiber",
  "Total Sugars",
  "Sugars",
  "Added Sugars",
  "Calcium",
  "Iron",
  "Potassium",
  "Vitamin D",
  "Vitamin C",
  "Vitamin A",
];

export const splitMacrosMicros = (totals: Record<string, ParsedNutrient>) => {
  const macroLabels = new Set<string>();
  for (const list of Object.values(MACRO_KEYS)) for (const k of list) macroLabels.add(k.toLowerCase());

  const macros: { label: string; parsed: ParsedNutrient }[] = [];
  const micros: { label: string; parsed: ParsedNutrient }[] = [];
  for (const [label, parsed] of Object.entries(totals)) {
    if (macroLabels.has(label.toLowerCase())) macros.push({ label, parsed });
    else micros.push({ label, parsed });
  }

  micros.sort((a, b) => {
    const ai = MICRO_PRIORITY.findIndex((p) => p.toLowerCase() === a.label.toLowerCase());
    const bi = MICRO_PRIORITY.findIndex((p) => p.toLowerCase() === b.label.toLowerCase());
    const av = ai === -1 ? 999 : ai;
    const bv = bi === -1 ? 999 : bi;
    if (av !== bv) return av - bv;
    return a.label.localeCompare(b.label);
  });

  return { macros, micros };
};

export const KEY_MICROS = [
  "Dietary Fiber",
  "Fiber",
  "Total Sugars",
  "Sugars",
  "Sodium",
  "Saturated Fat",
];

// Find a parsed nutrient by candidate keys inside an aggregated totals map.
export const findInTotals = (
  totals: Record<string, ParsedNutrient>,
  keys: readonly string[],
): ParsedNutrient | null => {
  const lc: Record<string, string> = {};
  for (const k of Object.keys(totals)) lc[k.toLowerCase()] = k;
  for (const k of keys) {
    const realKey = lc[k.toLowerCase()];
    if (realKey) return totals[realKey];
  }
  return null;
};
