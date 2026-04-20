import { useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { useAppStore } from "@/lib/store";
import { Heart, Plus, X, ChevronRight, Utensils } from "lucide-react";
import { findNutrient, MACRO_KEYS } from "@/lib/nutrition";
import { useToast } from "@/hooks/use-toast";
import { Sheet, SheetContent } from "@/components/ui/sheet";

interface StationGroup {
  station: string;
  items: ReturnType<typeof useAppStore.getState>["favorites"];
}

interface HallGroup {
  hall: string;
  totalItems: number;
  stations: StationGroup[];
}

const Favorites = () => {
  const favorites = useAppStore((s) => s.favorites);
  const addToTray = useAppStore((s) => s.addToTray);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  const { toast } = useToast();

  const [openHall, setOpenHall] = useState<string | null>(null);

  // Group by hall -> station
  const grouped = useMemo<HallGroup[]>(() => {
    const map = new Map<string, Map<string, typeof favorites>>();
    for (const f of favorites) {
      const hall = f.hallName || "Unknown hall";
      const station = f.stationName || "Unknown station";
      if (!map.has(hall)) map.set(hall, new Map());
      const stationMap = map.get(hall)!;
      if (!stationMap.has(station)) stationMap.set(station, []);
      stationMap.get(station)!.push(f);
    }
    return Array.from(map.entries()).map(([hall, stationMap]) => {
      const stations = Array.from(stationMap.entries()).map(([station, items]) => ({ station, items }));
      const totalItems = stations.reduce((s, st) => s + st.items.length, 0);
      return { hall, stations, totalItems };
    });
  }, [favorites]);

  const activeHall = grouped.find((g) => g.hall === openHall) ?? null;

  return (
    <>
      <AppHeader title="Favorites" subtitle={`${favorites.length} saved item${favorites.length === 1 ? "" : "s"}`} />

      <main className="max-w-2xl mx-auto px-4 py-4 animate-fade-in">
        {favorites.length === 0 ? (
          <div className="text-center py-12">
            <Heart className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
            <h2 className="text-base font-semibold mb-1">No favorites yet</h2>
            <p className="text-sm text-muted-foreground">
              Tap the heart on any food item to save it here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {grouped.map((group) => {
              const stationCount = group.stations.length;
              return (
                <button
                  key={group.hall}
                  onClick={() => setOpenHall(group.hall)}
                  className="text-left rounded-2xl bg-card border border-border shadow-card p-4 min-h-[120px] flex flex-col justify-between active:scale-[0.98] transition-transform"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                      <Utensils className="h-4 w-4" />
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground mt-1" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-foreground leading-snug line-clamp-2">
                      {group.hall}
                    </h3>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {group.totalItems} item{group.totalItems === 1 ? "" : "s"} · {stationCount} station
                      {stationCount === 1 ? "" : "s"}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>

      {/* Hall detail bottom sheet */}
      <Sheet open={!!activeHall} onOpenChange={(o) => !o && setOpenHall(null)}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl max-h-[85vh] p-0 gap-0 flex flex-col"
          hideClose
        >
          {activeHall && (
            <>
              <div className="px-5 pt-4 pb-3 border-b border-border/60">
                <div className="mx-auto w-10 h-1 rounded-full bg-muted mb-3" />
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold truncate">{activeHall.hall}</h2>
                    <p className="text-xs text-muted-foreground">
                      {activeHall.totalItems} favorite{activeHall.totalItems === 1 ? "" : "s"}
                    </p>
                  </div>
                  <button
                    onClick={() => setOpenHall(null)}
                    className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center active:scale-95"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-3 space-y-5">
                {activeHall.stations.map((stationGroup) => (
                  <section key={stationGroup.station}>
                    <h3 className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">
                      {stationGroup.station}
                    </h3>
                    <div className="flex flex-col gap-2">
                      {stationGroup.items.map((item) => {
                        const cal = findNutrient(item.nutrients, MACRO_KEYS.calories);
                        const p = findNutrient(item.nutrients, MACRO_KEYS.protein);
                        const c = findNutrient(item.nutrients, MACRO_KEYS.carbs);
                        const f = findNutrient(item.nutrients, MACRO_KEYS.fat);
                        return (
                          <div
                            key={item.foodId}
                            className="flex items-center gap-3 rounded-2xl bg-card border border-border/60 p-3"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-foreground line-clamp-1 leading-snug">
                                {item.name}
                              </p>
                              {item.servingSize && (
                                <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                                  {item.servingSize}
                                </p>
                              )}
                              <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px] font-medium">
                                {cal && (
                                  <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                                    {Math.round(cal.value)} cal
                                  </span>
                                )}
                                {p && (
                                  <span className="px-1.5 py-0.5 rounded-full bg-secondary text-foreground/70">
                                    P {Math.round(p.value)}g
                                  </span>
                                )}
                                {c && (
                                  <span className="px-1.5 py-0.5 rounded-full bg-secondary text-foreground/70">
                                    C {Math.round(c.value)}g
                                  </span>
                                )}
                                {f && (
                                  <span className="px-1.5 py-0.5 rounded-full bg-secondary text-foreground/70">
                                    F {Math.round(f.value)}g
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => toggleFavorite(item)}
                                className="h-8 w-8 rounded-full bg-primary/15 text-primary flex items-center justify-center active:scale-90"
                                aria-label="Remove favorite"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => {
                                  addToTray(item);
                                  toast({ title: "Added to tray", description: item.name });
                                }}
                                className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center active:scale-90 shadow-sm"
                                aria-label="Add to tray"
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
};

export default Favorites;
