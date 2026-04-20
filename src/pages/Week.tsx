import { useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import PullToRefresh from "@/components/PullToRefresh";
import { useAppStore } from "@/lib/store";
import {
  aggregateNutrients,
  findInTotals,
  MACRO_KEYS,
  type ParsedNutrient,
} from "@/lib/nutrition";
import { addDays, formatWeekRange, startOfWeek } from "@/lib/dates";
import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

interface WeekBucket {
  start: Date;
  label: string;
  isCurrent: boolean;
  cal?: ParsedNutrient | null;
  protein?: ParsedNutrient | null;
  carbs?: ParsedNutrient | null;
  fat?: ParsedNutrient | null;
  itemCount: number;
}

const Week = () => {
  const logs = useAppStore((s) => s.logs);
  const goals = useAppStore((s) => s.goals);
  const [, setRefreshTick] = useState(0);

  const handleRefresh = async () => {
    await new Promise((r) => setTimeout(r, 400));
    setRefreshTick((n) => n + 1);
  };

  const weeks = useMemo<WeekBucket[]>(() => {
    const now = new Date();
    const currentStart = startOfWeek(now);
    const buckets: WeekBucket[] = [];
    for (let i = 0; i < 5; i++) {
      const start = addDays(currentStart, -i * 7);
      const end = addDays(start, 7);
      const items = logs.filter((l) => {
        const d = new Date(l.loggedAt);
        return d >= start && d < end;
      });
      const agg = aggregateNutrients(items);
      buckets.push({
        start,
        label: formatWeekRange(start),
        isCurrent: i === 0,
        cal: findInTotals(agg.totals, MACRO_KEYS.calories),
        protein: findInTotals(agg.totals, MACRO_KEYS.protein),
        carbs: findInTotals(agg.totals, MACRO_KEYS.carbs),
        fat: findInTotals(agg.totals, MACRO_KEYS.fat),
        itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
      });
    }
    return buckets;
  }, [logs]);

  const current = weeks[0];
  const previous = weeks.slice(1);
  const weeklyCalGoal = goals.calories * 7;
  const currentPct = weeklyCalGoal
    ? Math.min(100, Math.round(((current.cal?.value ?? 0) / weeklyCalGoal) * 100))
    : 0;

  return (
    <>
      <AppHeader title="Week" subtitle="Trends over the last 5 weeks" />

      <PullToRefresh onRefresh={handleRefresh}>
      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4 animate-fade-in">
        {/* Current week hero */}
        <section className="rounded-3xl bg-primary text-primary-foreground p-5 shadow-lg shadow-primary/20">
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-xs uppercase tracking-wide opacity-80 font-semibold">
              This week
            </span>
            <span className="text-xs opacity-80">{current.label}</span>
          </div>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-4xl font-bold tracking-tight">
              {Math.round(current.cal?.value ?? 0).toLocaleString()}
            </span>
            <span className="text-sm opacity-85">
              / {weeklyCalGoal.toLocaleString()} kcal
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/20 overflow-hidden">
            <div
              className="h-full rounded-full bg-white transition-all duration-500"
              style={{ width: `${currentPct}%` }}
            />
          </div>

          <div className="grid grid-cols-3 gap-3 mt-5">
            {[
              { label: "Protein", val: current.protein, unit: "g" },
              { label: "Carbs", val: current.carbs, unit: "g" },
              { label: "Fat", val: current.fat, unit: "g" },
            ].map((m) => (
              <div key={m.label}>
                <p className="text-[10px] uppercase opacity-75 font-semibold tracking-wide">{m.label}</p>
                <p className="text-lg font-bold mt-0.5">
                  {Math.round(m.val?.value ?? 0)}
                  <span className="text-xs font-normal opacity-80">{m.unit}</span>
                </p>
              </div>
            ))}
          </div>

          <p className="text-[11px] opacity-80 mt-4">
            {current.itemCount} item{current.itemCount === 1 ? "" : "s"} logged
          </p>
        </section>

        {/* Previous weeks */}
        <div>
          <h2 className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2 px-1">
            Previous weeks
          </h2>
          {previous.every((w) => w.itemCount === 0) ? (
            <div className="text-center py-8 rounded-3xl bg-card border border-border shadow-card">
              <BarChart3 className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No history yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {previous.map((w) => {
                const pct = weeklyCalGoal
                  ? Math.min(100, Math.round(((w.cal?.value ?? 0) / weeklyCalGoal) * 100))
                  : 0;
                return (
                  <section
                    key={w.start.toISOString()}
                    className="rounded-2xl bg-card border border-border shadow-card p-4"
                  >
                    <div className="flex items-baseline justify-between mb-1">
                      <p className="text-sm font-semibold text-foreground">{w.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {w.itemCount} item{w.itemCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex items-baseline gap-1.5 mb-2">
                      <span className="text-xl font-bold text-foreground">
                        {Math.round(w.cal?.value ?? 0).toLocaleString()}
                      </span>
                      <span className="text-xs text-muted-foreground">kcal</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-secondary overflow-hidden mb-3">
                      <div
                        className={cn("h-full rounded-full", w.itemCount === 0 ? "bg-transparent" : "bg-primary/70")}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { l: "P", v: w.protein },
                        { l: "C", v: w.carbs },
                        { l: "F", v: w.fat },
                      ].map((m) => (
                        <div key={m.l} className="text-[11px] text-muted-foreground">
                          <span className="font-semibold text-foreground">{m.l} </span>
                          {Math.round(m.v?.value ?? 0)}g
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </main>
      </PullToRefresh>
    </>
  );
};

export default Week;
