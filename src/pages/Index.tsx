import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { RefreshCw, Search, Utensils, ChevronDown, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/ThemeToggle";
import FoodCard from "@/components/FoodCard";
import FilterSheet from "@/components/FilterSheet";
import { cn } from "@/lib/utils";

type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

interface DiningHall {
  id: string;
  name: string;
  unit_oid: number;
}

interface Station {
  id: string;
  name: string;
  dining_hall_id: string;
}

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

interface MenuCategory {
  id: string;
  name: string;
  station_id: string;
}

const Index = () => {
  const [selectedHall, setSelectedHall] = useState<string | null>(null);
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
      const { data, error } = await supabase.from("dining_halls").select("*").order("name");
      if (error) throw error;
      return data as DiningHall[];
    },
  });

  const activeHall = selectedHall || halls[0]?.id;
  const activeHallName = halls.find((h) => h.id === activeHall)?.name;

  const { data: stations = [] } = useQuery({
    queryKey: ["stations", activeHall],
    queryFn: async () => {
      if (!activeHall) return [];
      const { data, error } = await supabase
        .from("stations")
        .select("*")
        .eq("dining_hall_id", activeHall)
        .order("name");
      if (error) throw error;
      return data as Station[];
    },
    enabled: !!activeHall,
  });

  const stationIds = stations.map((s) => s.id);
  const { data: foodItems = [] } = useQuery({
    queryKey: ["food-items", stationIds],
    queryFn: async () => {
      if (stationIds.length === 0) return [];
      const { data, error } = await supabase
        .from("food_items")
        .select("*")
        .in("station_id", stationIds)
        .order("name");
      if (error) throw error;
      return data as FoodItem[];
    },
    enabled: stationIds.length > 0,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["menu-categories", stationIds],
    queryFn: async () => {
      if (stationIds.length === 0) return [];
      const { data, error } = await supabase
        .from("menu_categories")
        .select("*")
        .in("station_id", stationIds)
        .order("name");
      if (error) throw error;
      return data as MenuCategory[];
    },
    enabled: stationIds.length > 0,
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
      const { data, error } = await supabase.functions.invoke("netnutrition-scrape", { body: {} });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast({ title: "Updated", description: data.message });
      queryClient.invalidateQueries();
    },
    onError: (error) => {
      toast({ title: "Refresh failed", description: error.message, variant: "destructive" });
    },
  });

  const filteredItems = foodItems.filter((item) => {
    if (searchQuery && !item.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;

    if (selectedAllergens.length > 0) {
      const itemAllergens = Array.isArray(item.allergens) ? (item.allergens as string[]) : [];
      const hasAllergen = selectedAllergens.some((a) =>
        itemAllergens.some((ia) => typeof ia === "string" && ia.toLowerCase().includes(a.toLowerCase())),
      );
      if (hasAllergen) return false;
    }

    if (selectedDietary.length > 0) {
      const itemDietary = Array.isArray(item.dietary_flags) ? (item.dietary_flags as string[]) : [];
      const hasDietary = selectedDietary.every((d) =>
        itemDietary.some((id) => typeof id === "string" && id.toLowerCase().includes(d.toLowerCase())),
      );
      if (!hasDietary) return false;
    }

    return true;
  });

  const getItemsByStation = (stationId: string) =>
    filteredItems.filter((item) => item.station_id === stationId);

  const groupItemsByCategory = (items: FoodItem[], stationId: string) => {
    const stationCategories = categories.filter((c) => c.station_id === stationId);
    const groups: { id: string; name: string; items: FoodItem[] }[] = [];
    for (const cat of stationCategories) {
      const catItems = items.filter((i) => i.category_id === cat.id);
      if (catItems.length > 0) groups.push({ id: cat.id, name: cat.name, items: catItems });
    }
    const uncategorized = items.filter((i) => !i.category_id);
    if (uncategorized.length > 0) {
      const label = stationCategories.length > 0 ? "Other" : "All Items";
      groups.push({ id: "__uncategorized__", name: label, items: uncategorized });
    }
    return groups;
  };

  const filterCount = selectedAllergens.length + selectedDietary.length;

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Sticky top header */}
      <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-xl border-b border-border/60 pt-safe">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Utensils className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base font-bold text-foreground leading-tight truncate">
                  {activeHallName || "BSU Dining"}
                </h1>
                {lastScrape && (
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    Updated {new Date(lastScrape.scraped_at).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
            <ThemeToggle />
          </div>

          {/* Segmented dining hall control */}
          {halls.length > 0 && (
            <div className="mt-3 -mx-4 px-4 overflow-x-auto no-scrollbar">
              <div className="flex gap-1.5 pb-1">
                {halls.map((hall) => {
                  const active = hall.id === activeHall;
                  return (
                    <button
                      key={hall.id}
                      onClick={() => setSelectedHall(hall.id)}
                      className={cn(
                        "shrink-0 px-3.5 h-9 rounded-full text-xs font-semibold transition-all whitespace-nowrap active:scale-95",
                        active
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-secondary text-secondary-foreground",
                      )}
                    >
                      {hall.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

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

          {/* Active filter indicator */}
          {filterCount > 0 && (
            <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              {filterCount} filter{filterCount > 1 ? "s" : ""} active
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-2xl mx-auto px-4 py-4">
        {halls.length === 0 ? (
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
        ) : stations.length === 0 ? (
          <Card className="p-8 text-center mt-8 rounded-3xl border-0 bg-card shadow-sm">
            <p className="text-sm text-muted-foreground">No stations found.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {stations.map((station) => {
              const stationItems = getItemsByStation(station.id);
              const groups = groupItemsByCategory(stationItems, station.id);
              return (
                <Collapsible
                  key={station.id}
                  defaultOpen
                  className="rounded-2xl bg-card border border-border/60 shadow-sm overflow-hidden group/station"
                >
                  <CollapsibleTrigger className="w-full min-h-[44px] flex items-center justify-between px-4 py-3 active:bg-muted/40 transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <h2 className="font-semibold text-base text-foreground truncate">
                        {station.name}
                      </h2>
                      <Badge variant="secondary" className="rounded-full text-[10px] px-2 py-0 h-5 shrink-0">
                        {stationItems.length}
                      </Badge>
                    </div>
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 transition-transform group-data-[state=closed]/station:-rotate-90" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                    <div className="px-3 pb-3 pt-1">
                      {stationItems.length === 0 ? (
                        <p className="py-4 text-center text-sm text-muted-foreground">
                          No items match your filters
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {groups.map((group) => (
                            <Collapsible
                              key={group.id}
                              defaultOpen
                              className="group/cat"
                            >
                              <CollapsibleTrigger className="w-full flex items-center gap-2 mb-2 px-1 min-h-[32px]">
                                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=closed]/cat:-rotate-90" />
                                <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                                  {group.name}
                                </h3>
                                <span className="text-[11px] text-muted-foreground/70">
                                  {group.items.length}
                                </span>
                              </CollapsibleTrigger>
                              <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                                <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-2">
                                  {group.items.map((item) => (
                                    <FoodCard
                                      key={item.id}
                                      name={item.name}
                                      servingSize={item.serving_size}
                                      allergens={item.allergens}
                                      dietaryFlags={item.dietary_flags}
                                      nutrients={item.nutrients}
                                      expanded={expandedItem === item.id}
                                      onToggle={() =>
                                        setExpandedItem(expandedItem === item.id ? null : item.id)
                                      }
                                    />
                                  ))}
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          ))}
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
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
