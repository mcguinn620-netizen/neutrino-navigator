import { useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { useAppStore, type MealType } from "@/lib/store";
import {
  aggregateNutrients,
  findInTotals,
  formatNutrient,
  MACRO_KEYS,
  splitMacrosMicros,
} from "@/lib/nutrition";
import { isSameDay, formatTime } from "@/lib/dates";
import { ChevronDown, ChevronUp, Trash2, Plus, Minus, Utensils } from "lucide-react";
import { cn } from "@/lib/utils";

const MEAL_LABELS: Record<MealType, { label: string; emoji: string }> = {
  breakfast: { label: "Breakfast", emoji: "🥞" },
  lunch: { label: "Lunch", emoji: "🥗" },
  dinner: { label: "Dinner", emoji: "🍽️" },
  snacks: { label: "Snacks", emoji: "🍎" },
};

const MEAL_ORDER: MealType[] = ["breakfast", "lunch", "dinner", "snacks"];

const Today = () => {
  const logs = useAppStore((s) => s.logs);
  const goals = useAppStore((s) => s.goals);
  const removeLog = useAppStore((s) => s.removeLog);
  const setLogQuantity = useAppStore((s) => s.setLogQuantity);

  const [microsExpanded, setMicrosExpanded] = useState(false);

  const today = new Date();
  const todaysLogs = useMemo(
    () => logs.filter((l) => isSameDay(new Date(l.loggedAt), today)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [logs],
  );

  const agg = aggregateNutrients(todaysLogs);
  const cal = findInTotals(agg.totals, MACRO_KEYS.calories);
  const protein = findInTotals(agg.totals, MACRO_KEYS.protein);
  const carbs = findInTotals(agg.totals, MACRO_KEYS.carbs);
  const fat = findInTotals(agg.totals, MACRO_KEYS.fat);

  const { micros } = splitMacrosMicros(agg.totals);
  const visibleMicros = microsExpanded ? micros : micros.slice(0, 4);

  const calPct = goals.calories ? Math.min(100, Math.round(((cal?.value ?? 0) / goals.calories) * 100)) : 0;

  const macroBars = [
    { label: "Protein", current: protein?.value ?? 0, goal: goals.protein, unit: "g", color: "bg-bsu-blue" },
    { label: "Carbs", current: carbs?.value ?? 0, goal: goals.carbs, unit: "g", color: "bg-bsu-yellow" },
    { label: "Fat", current: fat?.value ?? 0, goal: goals.fat, unit: "g", color: "bg-muted-foreground" },
  ];

  return (
    <>
      <AppHeader title="Today" subtitle={today.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} />

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4 animate-fade-in">
        {/* Calorie summary */}
        <section className="rounded-3xl bg-card border border-border shadow-card p-5">
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
              Calories today
            </span>
            <span className="text-xs text-muted-foreground">Goal {goals.calories}</span>
          </div>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-4xl font-bold tracking-tight text-foreground">
              {Math.round(cal?.value ?? 0)}
            </span>
            <span className="text-sm text-muted-foreground">
              / {goals.calories} kcal
            </span>
          </div>
          <div className="h-2 rounded-full bg-secondary overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                calPct >= 100 ? "bg-success" : "bg-primary",
              )}
              style={{ width: `${calPct}%` }}
            />
          </div>

          <div className="grid grid-cols-3 gap-3 mt-5">
            {macroBars.map((m) => {
              const pct = m.goal ? Math.min(100, Math.round((m.current / m.goal) * 100)) : 0;
              return (
                <div key={m.label}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[11px] font-medium text-muted-foreground">{m.label}</span>
                    <span className="text-[10px] text-muted-foreground">{pct}%</span>
                  </div>
                  <p className="text-base font-semibold text-foreground mt-0.5">
                    {Math.round(m.current)}
                    <span className="text-xs font-normal text-muted-foreground">/{m.goal}{m.unit}</span>
                  </p>
                  <div className="h-1.5 rounded-full bg-secondary overflow-hidden mt-1">
                    <div className={cn("h-full rounded-full", m.color)} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Micronutrients */}
        {micros.length > 0 && (
          <section className="rounded-3xl bg-card border border-border shadow-card p-5">
            <button
              onClick={() => setMicrosExpanded((v) => !v)}
              className="w-full flex items-center justify-between mb-3"
              aria-expanded={microsExpanded}
            >
              <span className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                Micronutrients
              </span>
              {microsExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {visibleMicros.map(({ label, parsed }) => (
                <div
                  key={label}
                  className="flex justify-between text-xs py-1.5 border-b border-border/40 last:border-b-0"
                >
                  <span className="text-muted-foreground truncate pr-2">{label}</span>
                  <span className="font-medium text-foreground shrink-0">
                    {formatNutrient(parsed.value, parsed.unit)}
                  </span>
                </div>
              ))}
            </div>
            {!microsExpanded && micros.length > 4 && (
              <button
                onClick={() => setMicrosExpanded(true)}
                className="text-xs text-primary font-semibold mt-3"
              >
                Show {micros.length - 4} more
              </button>
            )}
          </section>
        )}

        {/* Meals */}
        {MEAL_ORDER.map((meal) => {
          const items = todaysLogs.filter((l) => l.meal === meal);
          const mealAgg = aggregateNutrients(items);
          const mealCal = findInTotals(mealAgg.totals, MACRO_KEYS.calories);
          return (
            <section
              key={meal}
              className="rounded-3xl bg-card border border-border shadow-card p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{MEAL_LABELS[meal].emoji}</span>
                  <h3 className="text-base font-bold text-foreground">{MEAL_LABELS[meal].label}</h3>
                </div>
                {mealCal && (
                  <span className="text-xs font-medium text-muted-foreground">
                    {Math.round(mealCal.value)} cal
                  </span>
                )}
              </div>

              {items.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-2">No items yet</p>
              ) : (
                <div className="space-y-1.5">
                  {items.map((it) => {
                    const itemCal = findInTotals(aggregateNutrients([it]).totals, MACRO_KEYS.calories);
                    return (
                      <div key={it.logId} className="flex items-center gap-2 py-1.5 border-b border-border/40 last:border-b-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{it.name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {formatTime(it.loggedAt)} · {it.hallName}
                            {itemCal && ` · ${Math.round(itemCal.value)} cal`}
                          </p>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            onClick={() => setLogQuantity(it.logId, it.quantity - 1)}
                            className="h-7 w-7 rounded-full bg-secondary flex items-center justify-center active:scale-95"
                            aria-label="Decrease"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-5 text-center text-xs font-semibold">{it.quantity}</span>
                          <button
                            onClick={() => setLogQuantity(it.logId, it.quantity + 1)}
                            className="h-7 w-7 rounded-full bg-secondary flex items-center justify-center active:scale-95"
                            aria-label="Increase"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => removeLog(it.logId)}
                            className="h-7 w-7 rounded-full text-muted-foreground active:text-destructive flex items-center justify-center ml-0.5"
                            aria-label="Remove"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}

        {todaysLogs.length === 0 && (
          <div className="text-center py-8">
            <Utensils className="h-10 w-10 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              Browse dining halls and add items to your tray to start logging.
            </p>
          </div>
        )}
      </main>
    </>
  );
};

export default Today;
