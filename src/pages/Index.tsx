import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, Search, Utensils, ChevronRight, ChevronLeft, X, Building2, Store, FolderOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/ThemeToggle";
import FoodCard from "@/components/FoodCard";
import FilterSheet from "@/components/FilterSheet";
import { cn } from "@/lib/utils";
import { useSwipeBack } from "@/hooks/use-swipe-back";

type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

interface DiningHall { id: string; name: string; unit_oid: number; }
interface Station { id: string; name: string; dining_hall_id: string; }
interface MenuCategory { id: string; name: string; station_id: string; }
interface FoodItem {
  id: string;
  name: string;
  station_id: string;
  category_id: string | null;
  serving_size: string | null;
  allergens: Json;
  dietary_flags: Json;
  nutrients: Json;
  detail_oid: number;
}

type View =
  | { level: "halls" }
  | { level: "stations"; hallId: string }
  | { level: "categories"; hallId: string; stationId: string }
  | { level: "foods"; hallId: string; stationId: string; categoryId: string };

const Index = () => {
  const [view, setView] = useState<View>({ level: "halls" });
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedAllergens, setSelectedAllergens] = useState<string[]>([]);
  const [selectedDietary, setSelectedDietary] = useState<string[]>([]);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: halls = [] } = useQuery({
    queryKey: ["dining-halls"],
    queryFn: async () => {
      const { data, error } = await supabase.from("dining_halls").select("*").order("unit_oid");
      if (error) throw error;
      return data as DiningHall[];
    },
  });

  const { data: stations = [] } = useQuery({
    queryKey: ["stations", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stations").select("*").order("unit_oid");
      if (error) throw error;
      return data as Station[];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["menu-categories", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("menu_categories").select("*").order("name");
      if (error) throw error;
      return data as MenuCategory[];
    },
  });

  const { data: foodItems = [] } = useQuery({
    queryKey: ["food-items", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("food_items").select("*").order("name");
      if (error) throw error;
      return data as FoodItem[];
    },
  });

  const { data: lastScrape } = useQuery({
    queryKey: ["last-scrape"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scrape_logs")
        .select("*")
        .order("scraped_at", { ascending: false })
        .limit(1)
        .single();
      if (error) return null;
      return data;
    },
  });

  const scrapeMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("netnutrition-scrape", { body: { wipe: true } });
      if (error) throw error;
      if (data?.success === false) throw new Error(data?.message || "Refresh failed");
      return data;
    },
    onSuccess: (data) => {
      const dispatched = data?.hallsDispatched ?? 0;
      toast({
        title: "Refresh started",
        description: dispatched > 0
          ? `Scraping ${dispatched} dining halls in the background. New data will appear in 1–3 minutes.`
          : data?.message ?? "Refresh started",
      });
      // Poll for new data every 10s for up to 4 minutes
      let polls = 0;
      const interval = setInterval(() => {
        polls += 1;
        queryClient.invalidateQueries();
        if (polls >= 24) clearInterval(interval);
      }, 10000);
    },
    onError: (error) => {
      toast({ title: "Refresh failed", description: error.message, variant: "destructive" });
    },
  });

  const passesFilters = (item: FoodItem) => {
    if (searchQuery && !item.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (selectedAllergens.length > 0) {
      const itemAllergens = Array.isArray(item.allergens) ? (item.allergens as string[]) : [];
      const has = selectedAllergens.some((a) =>
        itemAllergens.some((ia) => typeof ia === "string" && ia.toLowerCase().includes(a.toLowerCase())),
      );
      if (has) return false;
    }
    if (selectedDietary.length > 0) {
      const itemDietary = Array.isArray(item.dietary_flags) ? (item.dietary_flags as string[]) : [];
      const has = selectedDietary.every((d) =>
        itemDietary.some((id) => typeof id === "string" && id.toLowerCase().includes(d.toLowerCase())),
      );
      if (!has) return false;
    }
    return true;
  };

  const filteredItems = useMemo(
    () => foodItems.filter(passesFilters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [foodItems, searchQuery, selectedAllergens, selectedDietary],
  );

  const filterCount = selectedAllergens.length + selectedDietary.length;

  // Derived data per view
  const currentHall = "hallId" in view ? halls.find((h) => h.id === view.hallId) : undefined;
  const currentStation = "stationId" in view ? stations.find((s) => s.id === view.stationId) : undefined;
  const currentCategory =
    "categoryId" in view
      ? view.categoryId === "__uncategorized__"
        ? { id: "__uncategorized__", name: "All Items", station_id: view.stationId }
        : categories.find((c) => c.id === view.categoryId)
      : undefined;

  const stationsForHall = "hallId" in view ? stations.filter((s) => s.dining_hall_id === view.hallId) : [];
  const itemsForStation =
    "stationId" in view ? filteredItems.filter((i) => i.station_id === view.stationId) : [];

  const categoriesForStation = useMemo(() => {
    if (!("stationId" in view)) return [];
    const stationCats = categories.filter((c) => c.station_id === view.stationId);
    const result: { id: string; name: string; count: number }[] = [];
    for (const cat of stationCats) {
      const count = itemsForStation.filter((i) => i.category_id === cat.id).length;
      if (count > 0) result.push({ id: cat.id, name: cat.name, count });
    }
    const uncat = itemsForStation.filter((i) => !i.category_id).length;
    if (uncat > 0) {
      result.push({
        id: "__uncategorized__",
        name: stationCats.length > 0 ? "Other" : "All Items",
        count: uncat,
      });
    }
    return result;
  }, [view, categories, itemsForStation]);

  const itemsForCategory =
    "categoryId" in view
      ? itemsForStation.filter((i) =>
          view.categoryId === "__uncategorized__" ? !i.category_id : i.category_id === view.categoryId,
        )
      : [];

  // Hall item counts (after filters)
  const hallItemCount = (hallId: string) => {
    const sIds = stations.filter((s) => s.dining_hall_id === hallId).map((s) => s.id);
    return filteredItems.filter((i) => sIds.includes(i.station_id)).length;
  };

  const stationItemCount = (stationId: string) =>
    filteredItems.filter((i) => i.station_id === stationId).length;

  // Header title + back
  const headerTitle =
    view.level === "halls"
      ? "BSU Dining"
      : view.level === "stations"
        ? currentHall?.name || "Stations"
        : view.level === "categories"
          ? currentStation?.name || "Categories"
          : currentCategory?.name || "Items";

  const goBack = () => {
    setExpandedItem(null);
    if (view.level === "stations") setView({ level: "halls" });
    else if (view.level === "categories") setView({ level: "stations", hallId: view.hallId });
    else if (view.level === "foods")
      setView({ level: "categories", hallId: view.hallId, stationId: view.stationId });
  };

  // iOS-style swipe-back from left edge
  useSwipeBack({ enabled: view.level !== "halls", onBack: goBack });

  // Color accents for variety (used sparingly per brand guidance)
  const accentColors = ["bg-primary/10 text-primary", "bg-bsu-blue/10 text-bsu-blue", "bg-success/20 text-foreground", "bg-bsu-yellow/20 text-foreground"];

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Sticky top header */}
      <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-xl border-b border-border/60 pt-safe">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {view.level !== "halls" ? (
                <button
                  onClick={goBack}
                  className="h-9 w-9 -ml-1 rounded-full flex items-center justify-center active:bg-muted shrink-0"
                  aria-label="Back"
                >
                  <ChevronLeft className="h-5 w-5 text-primary" />
                </button>
              ) : (
                <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center shrink-0">
                  <Utensils className="h-5 w-5 text-primary-foreground" />
                </div>
              )}
              <div className="min-w-0">
                <h1 className="text-base font-bold text-foreground leading-tight truncate">
                  {headerTitle}
                </h1>
                {lastScrape && view.level === "halls" && (
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    Updated {new Date(lastScrape.scraped_at).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
            <ThemeToggle />
          </div>

          {/* Inline search */}
          {searchOpen && (
            <div className="mt-2 relative animate-fade-in">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Search food items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-9 h-10 rounded-xl bg-secondary border-0"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-muted-foreground/20 flex items-center justify-center"
                  aria-label="Clear search"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )}

          {filterCount > 0 && (
            <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              {filterCount} filter{filterCount > 1 ? "s" : ""} active
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-2xl mx-auto px-4 py-4 animate-fade-in" key={view.level + ("hallId" in view ? view.hallId : "") + ("stationId" in view ? view.stationId : "") + ("categoryId" in view ? view.categoryId : "")}>
        {/* HALLS */}
        {view.level === "halls" && (
          halls.length === 0 ? (
            <Card className="p-8 text-center mt-8 rounded-3xl border-0 bg-card shadow-sm">
              <Utensils className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
              <h2 className="text-lg font-semibold mb-1">No data yet</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Tap refresh to load dining hall information.
              </p>
              <Button
                onClick={() => scrapeMutation.mutate()}
                disabled={scrapeMutation.isPending}
                className="rounded-full h-11 px-6"
              >
                <RefreshCw className={cn("h-4 w-4", scrapeMutation.isPending && "animate-spin")} />
                {scrapeMutation.isPending ? "Loading..." : "Load data"}
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {halls.map((hall, i) => {
                const count = hallItemCount(hall.id);
                const accent = accentColors[i % accentColors.length];
                return (
                  <button
                    key={hall.id}
                    onClick={() => setView({ level: "stations", hallId: hall.id })}
                    className="group text-left rounded-2xl bg-card border border-border/60 shadow-sm p-4 min-h-[140px] flex flex-col justify-between active:scale-[0.97] transition-transform"
                  >
                    <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", accent)}>
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-sm text-foreground leading-tight line-clamp-2">
                        {hall.name}
                      </h2>
                      <p className="text-[11px] text-muted-foreground mt-1">{count} items</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )
        )}

        {/* STATIONS */}
        {view.level === "stations" && (
          stationsForHall.length === 0 ? (
            <Card className="p-8 text-center mt-8 rounded-3xl border-0 bg-card shadow-sm">
              <p className="text-sm text-muted-foreground">No stations found.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {stationsForHall.map((station, i) => {
                const count = stationItemCount(station.id);
                const accent = accentColors[i % accentColors.length];
                return (
                  <button
                    key={station.id}
                    onClick={() => setView({ level: "categories", hallId: view.hallId, stationId: station.id })}
                    className="text-left rounded-2xl bg-card border border-border/60 shadow-sm p-4 min-h-[120px] flex flex-col justify-between active:scale-[0.97] transition-transform"
                  >
                    <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center", accent)}>
                      <Store className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-sm text-foreground leading-tight line-clamp-2">
                        {station.name}
                      </h2>
                      <p className="text-[11px] text-muted-foreground mt-1">{count} items</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )
        )}

        {/* CATEGORIES */}
        {view.level === "categories" && (
          categoriesForStation.length === 0 ? (
            <Card className="p-8 text-center mt-8 rounded-3xl border-0 bg-card shadow-sm">
              <p className="text-sm text-muted-foreground">No items match your filters.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {categoriesForStation.map((cat, i) => {
                const accent = accentColors[i % accentColors.length];
                return (
                  <button
                    key={cat.id}
                    onClick={() =>
                      setView({
                        level: "foods",
                        hallId: (view as any).hallId,
                        stationId: view.stationId,
                        categoryId: cat.id,
                      })
                    }
                    className="text-left rounded-2xl bg-card border border-border/60 shadow-sm p-4 min-h-[110px] flex flex-col justify-between active:scale-[0.97] transition-transform"
                  >
                    <div className="flex items-center justify-between">
                      <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center", accent)}>
                        <FolderOpen className="h-4.5 w-4.5" />
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-sm text-foreground leading-tight line-clamp-2">
                        {cat.name}
                      </h2>
                      <p className="text-[11px] text-muted-foreground mt-1">{cat.count} items</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )
        )}

        {/* FOODS */}
        {view.level === "foods" && (
          itemsForCategory.length === 0 ? (
            <Card className="p-8 text-center mt-8 rounded-3xl border-0 bg-card shadow-sm">
              <p className="text-sm text-muted-foreground">No items match your filters.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3 items-start">
              {itemsForCategory.map((item) => (
                <FoodCard
                  key={item.id}
                  name={item.name}
                  servingSize={item.serving_size}
                  allergens={item.allergens}
                  dietaryFlags={item.dietary_flags}
                  nutrients={item.nutrients}
                  expanded={expandedItem === item.id}
                  onToggle={() => setExpandedItem(expandedItem === item.id ? null : item.id)}
                />
              ))}
            </div>
          )
        )}
      </main>

      {/* Bottom action bar */}
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-background/85 backdrop-blur-xl border-t border-border/60 pb-safe">
        <div className="max-w-2xl mx-auto px-3 py-1.5 flex items-center justify-around">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSearchOpen((v) => !v)}
            className={cn(
              "flex flex-col h-auto py-1.5 px-3 min-w-[44px] gap-0.5",
              searchOpen && "text-primary",
            )}
          >
            <Search className="h-5 w-5" />
            <span className="text-[10px]">Search</span>
          </Button>

          <FilterSheet
            selectedAllergens={selectedAllergens}
            selectedDietary={selectedDietary}
            onAllergenChange={setSelectedAllergens}
            onDietaryChange={setSelectedDietary}
          />

          <Button
            variant="ghost"
            size="sm"
            onClick={() => scrapeMutation.mutate()}
            disabled={scrapeMutation.isPending}
            className="flex flex-col h-auto py-1.5 px-3 min-w-[44px] gap-0.5"
          >
            <RefreshCw className={cn("h-5 w-5", scrapeMutation.isPending && "animate-spin")} />
            <span className="text-[10px]">Refresh</span>
          </Button>
        </div>
      </nav>
    </div>
  );
};

export default Index;
