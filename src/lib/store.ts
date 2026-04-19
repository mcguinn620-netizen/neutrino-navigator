// Local-first persistent store for tray, meal logs, favorites, and goals.
// Uses zustand + localStorage. Designed so we can swap to a cloud-backed
// implementation later without touching screens — interface stays the same.

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type MealType = "breakfast" | "lunch" | "dinner" | "snacks";

export interface FoodSnapshot {
  // Stable identifier from food_items.id
  foodId: string;
  name: string;
  servingSize: string | null;
  hallName: string;
  stationName: string;
  // Full nutrient map captured at log time so history survives menu changes
  nutrients: Record<string, string | number | null | undefined>;
  allergens: unknown;
  dietaryFlags: unknown;
}

export interface TrayItem extends FoodSnapshot {
  // Locally unique id for this tray entry
  trayId: string;
  quantity: number;
}

export interface LoggedItem extends FoodSnapshot {
  logId: string;
  quantity: number;
  meal: MealType;
  // ISO timestamp
  loggedAt: string;
}

export interface FavoriteItem extends FoodSnapshot {
  favoritedAt: string;
}

export interface NutritionGoals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface AppState {
  tray: TrayItem[];
  logs: LoggedItem[];
  favorites: FavoriteItem[]; // keyed by foodId
  goals: NutritionGoals;

  addToTray: (snap: FoodSnapshot) => void;
  removeFromTray: (trayId: string) => void;
  setTrayQuantity: (trayId: string, quantity: number) => void;
  clearTray: () => void;

  logTray: (meal: MealType) => void;
  removeLog: (logId: string) => void;
  setLogQuantity: (logId: string, quantity: number) => void;

  toggleFavorite: (snap: FoodSnapshot) => void;
  isFavorite: (foodId: string) => boolean;

  setGoals: (goals: Partial<NutritionGoals>) => void;
}

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const DEFAULT_GOALS: NutritionGoals = {
  calories: 2000,
  protein: 150,
  carbs: 250,
  fat: 70,
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      tray: [],
      logs: [],
      favorites: [],
      goals: DEFAULT_GOALS,

      addToTray: (snap) =>
        set((s) => {
          // If already present, just bump quantity
          const existing = s.tray.find((t) => t.foodId === snap.foodId);
          if (existing) {
            return {
              tray: s.tray.map((t) =>
                t.trayId === existing.trayId ? { ...t, quantity: t.quantity + 1 } : t,
              ),
            };
          }
          return { tray: [...s.tray, { ...snap, trayId: uid(), quantity: 1 }] };
        }),

      removeFromTray: (trayId) =>
        set((s) => ({ tray: s.tray.filter((t) => t.trayId !== trayId) })),

      setTrayQuantity: (trayId, quantity) =>
        set((s) => ({
          tray: s.tray
            .map((t) => (t.trayId === trayId ? { ...t, quantity } : t))
            .filter((t) => t.quantity > 0),
        })),

      clearTray: () => set({ tray: [] }),

      logTray: (meal) =>
        set((s) => {
          if (s.tray.length === 0) return s;
          const now = new Date().toISOString();
          const newLogs: LoggedItem[] = s.tray.map((t) => ({
            foodId: t.foodId,
            name: t.name,
            servingSize: t.servingSize,
            hallName: t.hallName,
            stationName: t.stationName,
            nutrients: t.nutrients,
            allergens: t.allergens,
            dietaryFlags: t.dietaryFlags,
            quantity: t.quantity,
            meal,
            loggedAt: now,
            logId: uid(),
          }));
          return { logs: [...s.logs, ...newLogs], tray: [] };
        }),

      removeLog: (logId) => set((s) => ({ logs: s.logs.filter((l) => l.logId !== logId) })),

      setLogQuantity: (logId, quantity) =>
        set((s) => ({
          logs: s.logs
            .map((l) => (l.logId === logId ? { ...l, quantity } : l))
            .filter((l) => l.quantity > 0),
        })),

      toggleFavorite: (snap) =>
        set((s) => {
          const exists = s.favorites.find((f) => f.foodId === snap.foodId);
          if (exists) {
            return { favorites: s.favorites.filter((f) => f.foodId !== snap.foodId) };
          }
          return {
            favorites: [...s.favorites, { ...snap, favoritedAt: new Date().toISOString() }],
          };
        }),

      isFavorite: (foodId) => !!get().favorites.find((f) => f.foodId === foodId),

      setGoals: (g) => set((s) => ({ goals: { ...s.goals, ...g } })),
    }),
    {
      name: "bsu-dining-app",
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
);
