import { useState } from "react";
import { ShoppingBag, Plus, Minus, Trash2, X } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useAppStore, type MealType } from "@/lib/store";
import { aggregateNutrients, findNutrient, findInTotals, MACRO_KEYS } from "@/lib/nutrition";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const MEALS: { id: MealType; label: string; emoji: string }[] = [
  { id: "breakfast", label: "Breakfast", emoji: "🥞" },
  { id: "lunch", label: "Lunch", emoji: "🥗" },
  { id: "dinner", label: "Dinner", emoji: "🍽️" },
  { id: "snacks", label: "Snacks", emoji: "🍎" },
];

const TrayBar = () => {
  const tray = useAppStore((s) => s.tray);
  const setQty = useAppStore((s) => s.setTrayQuantity);
  const remove = useAppStore((s) => s.removeFromTray);
  const clear = useAppStore((s) => s.clearTray);
  const logTray = useAppStore((s) => s.logTray);
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [mealOpen, setMealOpen] = useState(false);

  if (tray.length === 0) return null;

  const totalItems = tray.reduce((s, t) => s + t.quantity, 0);
  const agg = aggregateNutrients(tray);
  const cal = findInTotals(agg.totals, MACRO_KEYS.calories);
  const protein = findInTotals(agg.totals, MACRO_KEYS.protein);
  const carbs = findInTotals(agg.totals, MACRO_KEYS.carbs);
  const fat = findInTotals(agg.totals, MACRO_KEYS.fat);

  const handleLog = (meal: MealType) => {
    logTray(meal);
    setMealOpen(false);
    setOpen(false);
    toast({ title: "Logged to " + meal, description: `${totalItems} item${totalItems > 1 ? "s" : ""} saved.` });
  };

  return (
    <>
      {/* Floating tray pill, sits just above bottom tab bar */}
      <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+72px)] z-40 px-3 pointer-events-none">
        <div className="max-w-2xl mx-auto pointer-events-auto animate-fade-in">
          <button
            onClick={() => setOpen(true)}
            className="w-full flex items-center justify-between gap-2 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25 px-4 py-3 active:scale-[0.98] transition-transform"
            aria-label="Open tray"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="relative">
                <ShoppingBag className="h-5 w-5 shrink-0" />
                <span className="absolute -top-2 -right-2 h-4 min-w-[16px] px-1 rounded-full bg-background text-primary text-[10px] font-bold flex items-center justify-center">
                  {totalItems}
                </span>
              </div>
              <span className="font-semibold text-sm truncate">
                {totalItems} item{totalItems > 1 ? "s" : ""} in tray
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0 text-xs font-medium opacity-90">
              {cal && <span>{Math.round(cal.value)} cal</span>}
              {protein && <span className="opacity-80">P {Math.round(protein.value)}g</span>}
              {carbs && <span className="opacity-80">C {Math.round(carbs.value)}g</span>}
              {fat && <span className="opacity-80">F {Math.round(fat.value)}g</span>}
            </div>
          </button>
        </div>
      </div>

      {/* Tray detail sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl max-h-[85vh] p-0 gap-0 flex flex-col"
          hideClose
        >
          <div className="px-5 pt-4 pb-3 border-b border-border/60">
            <div className="mx-auto w-10 h-1 rounded-full bg-muted mb-3" />
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-bold">Your tray</h2>
                <p className="text-xs text-muted-foreground">
                  {totalItems} item{totalItems > 1 ? "s" : ""}
                </p>
              </div>
              <button
                onClick={clear}
                className="text-xs font-medium text-muted-foreground active:text-destructive flex items-center gap-1 shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear
              </button>
            </div>
            <div className="mt-3 flex items-center gap-2 text-[11px] font-medium">
              {cal && (
                <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary">
                  {Math.round(cal.value)} cal
                </span>
              )}
              {protein && (
                <span className="px-2.5 py-1 rounded-full bg-secondary text-foreground/80">
                  P {Math.round(protein.value)}g
                </span>
              )}
              {carbs && (
                <span className="px-2.5 py-1 rounded-full bg-secondary text-foreground/80">
                  C {Math.round(carbs.value)}g
                </span>
              )}
              {fat && (
                <span className="px-2.5 py-1 rounded-full bg-secondary text-foreground/80">
                  F {Math.round(fat.value)}g
                </span>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
            {tray.map((item) => {
              const itemCal = findNutrient(item.nutrients, MACRO_KEYS.calories);
              const itemP = findNutrient(item.nutrients, MACRO_KEYS.protein);
              const itemC = findNutrient(item.nutrients, MACRO_KEYS.carbs);
              const itemF = findNutrient(item.nutrients, MACRO_KEYS.fat);
              return (
                <div
                  key={item.trayId}
                  className="flex items-center gap-3 rounded-2xl bg-card border border-border/60 p-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">
                      {item.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground line-clamp-1">
                      {item.hallName} · {item.stationName}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px] font-medium">
                      {itemCal && (
                        <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                          {Math.round(itemCal.value * item.quantity)} cal
                        </span>
                      )}
                      {itemP && (
                        <span className="px-1.5 py-0.5 rounded-full bg-secondary text-foreground/70">
                          P {Math.round(itemP.value * item.quantity)}g
                        </span>
                      )}
                      {itemC && (
                        <span className="px-1.5 py-0.5 rounded-full bg-secondary text-foreground/70">
                          C {Math.round(itemC.value * item.quantity)}g
                        </span>
                      )}
                      {itemF && (
                        <span className="px-1.5 py-0.5 rounded-full bg-secondary text-foreground/70">
                          F {Math.round(itemF.value * item.quantity)}g
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setQty(item.trayId, item.quantity - 1)}
                      className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center active:scale-95"
                      aria-label="Decrease"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                    <button
                      onClick={() => setQty(item.trayId, item.quantity + 1)}
                      className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center active:scale-95"
                      aria-label="Increase"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => remove(item.trayId)}
                      className="h-8 w-8 rounded-full text-muted-foreground active:text-destructive flex items-center justify-center ml-1"
                      aria-label="Remove"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-t border-border/60 px-5 pt-3 pb-safe-0 pb-4 bg-background">
            <Button
              onClick={() => setMealOpen(true)}
              className="w-full h-12 rounded-full font-semibold text-base"
            >
              Log meal
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Meal-type action sheet */}
      <Sheet open={mealOpen} onOpenChange={setMealOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl pb-safe" hideClose>
          <div className="mx-auto w-10 h-1 rounded-full bg-muted -mt-2 mb-3" />
          <h3 className="text-lg font-bold text-center mb-1">Log to which meal?</h3>
          <p className="text-xs text-muted-foreground text-center mb-4">
            {totalItems} item{totalItems > 1 ? "s" : ""} will be saved to today
          </p>
          <div className="grid grid-cols-2 gap-2">
            {MEALS.map((m) => (
              <button
                key={m.id}
                onClick={() => handleLog(m.id)}
                className={cn(
                  "rounded-2xl bg-card border border-border p-4 flex flex-col items-center gap-1",
                  "active:scale-95 active:bg-secondary transition-transform",
                )}
              >
                <span className="text-2xl">{m.emoji}</span>
                <span className="text-sm font-semibold">{m.label}</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => setMealOpen(false)}
            className="w-full mt-3 h-11 rounded-full text-sm font-medium text-muted-foreground active:bg-muted"
          >
            Cancel
          </button>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default TrayBar;
