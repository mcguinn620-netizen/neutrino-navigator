---
name: App architecture
description: Mobile-first dining + nutrition tracker with bottom tabs, tray-based logging, and local-first persistence
type: feature
---
# App architecture

## Routes (under `AppLayout`)
- `/` — Browse Dining (Home, layout untouched per user constraint)
- `/today` — calorie/macro summary, expandable micronutrients, meal sections
- `/favorites` — grouped by hall → station, 2-col cards
- `/week` — current-week hero + previous 4 weeks (sum-of-items math)

## Bottom tab bar
`src/components/BottomTabBar.tsx`. Persistent across all 4 tabs via `AppLayout`.

## Top app bar
`src/components/AppHeader.tsx` — Cardinal Red background (`bg-primary`).
Home page (`pages/Index.tsx`) inlines its own version because it has search + filter + back button + variable header content — same red treatment though.

## Tray + logging
`src/lib/store.ts` (zustand + localStorage, persist key `bsu-dining-app`).
- `addToTray` increments quantity if foodId already present.
- `logTray(meal)` snapshots all tray items into `logs` with timestamp + meal type, then clears tray.
- Snapshot includes full nutrient map so history survives menu changes.
- `TrayBar.tsx` renders a floating pill (above bottom tabs) only when items exist; opens detail sheet → meal-type action sheet.

## Storage swap path
Store API is intentionally simple (`addToTray`, `logTray`, etc.). To move to cloud later: replace zustand persist middleware with Supabase calls; screens stay unchanged.

## Settings
`src/components/SettingsSheet.tsx` — opens from gear icon in every header. Goals (cal/protein/carbs/fat), theme (light/dark/system), refresh database.

## Nutrition aggregation
`src/lib/nutrition.ts` parses values like "240", "12 g", "320 mg". Skips % values when summing. Exposes `aggregateNutrients`, `findInTotals`, `splitMacrosMicros`.
