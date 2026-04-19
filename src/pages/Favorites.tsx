import { useMemo } from "react";
import AppHeader from "@/components/AppHeader";
import { useAppStore } from "@/lib/store";
import { Heart, Plus, X } from "lucide-react";
import { findNutrient, MACRO_KEYS } from "@/lib/nutrition";
import { useToast } from "@/hooks/use-toast";

const Favorites = () => {
  const favorites = useAppStore((s) => s.favorites);
  const addToTray = useAppStore((s) => s.addToTray);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  const { toast } = useToast();

  // Group by hall -> station
  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, typeof favorites>>();
    for (const f of favorites) {
      const hall = f.hallName || "Unknown hall";
      const station = f.stationName || "Unknown station";
      if (!map.has(hall)) map.set(hall, new Map());
      const stationMap = map.get(hall)!;
      if (!stationMap.has(station)) stationMap.set(station, []);
      stationMap.get(station)!.push(f);
    }
    return Array.from(map.entries()).map(([hall, stationMap]) => ({
      hall,
      stations: Array.from(stationMap.entries()).map(([station, items]) => ({ station, items })),
    }));
  }, [favorites]);

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
          <div className="space-y-6">
            {grouped.map((group) => (
              <section key={group.hall}>
                <h2 className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2 px-1">
                  {group.hall}
                </h2>
                {group.stations.map((stationGroup) => (
                  <div key={stationGroup.station} className="mb-4">
                    <p className="text-[11px] text-muted-foreground mb-2 px-1">
                      {stationGroup.station}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {stationGroup.items.map((item) => {
                        const cal = findNutrient(item.nutrients, MACRO_KEYS.calories);
                        return (
                          <div
                            key={item.foodId}
                            className="relative rounded-2xl bg-card border border-border shadow-card p-3 min-h-[120px] flex flex-col justify-between"
                          >
                            <div>
                              <h3 className="font-semibold text-sm text-foreground leading-snug line-clamp-2 pr-12">
                                {item.name}
                              </h3>
                              {item.servingSize && (
                                <p className="text-[11px] text-muted-foreground line-clamp-1 mt-1">
                                  {item.servingSize}
                                </p>
                              )}
                              {cal && (
                                <span className="inline-flex items-center rounded-full px-1.5 h-5 text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20 mt-1.5">
                                  {Math.round(cal.value)} cal
                                </span>
                              )}
                            </div>
                            <div className="absolute top-2 right-2 flex items-center gap-1">
                              <button
                                onClick={() => toggleFavorite(item)}
                                className="h-7 w-7 rounded-full bg-primary/15 text-primary flex items-center justify-center active:scale-90"
                                aria-label="Remove favorite"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => {
                                  addToTray(item);
                                  toast({ title: "Added to tray", description: item.name });
                                }}
                                className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center active:scale-90 shadow-sm"
                                aria-label="Add to tray"
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}
      </main>
    </>
  );
};

export default Favorites;
