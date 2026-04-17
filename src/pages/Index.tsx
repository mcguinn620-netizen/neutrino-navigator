import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, Search, Utensils, Leaf, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import NutritionPanel from "@/components/NutritionPanel";
import AllergenFilterBar from "@/components/AllergenFilterBar";
import { ThemeToggle } from "@/components/ThemeToggle";

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
  const [selectedAllergens, setSelectedAllergens] = useState<string[]>([]);
  const [selectedDietary, setSelectedDietary] = useState<string[]>([]);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch dining halls
  const { data: halls = [] } = useQuery({
    queryKey: ["dining-halls"],
    queryFn: async () => {
      const { data, error } = await supabase.from("dining_halls").select("*").order("name");
      if (error) throw error;
      return data as DiningHall[];
    },
  });

  // Auto-select first hall
  const activeHall = selectedHall || halls[0]?.id;

  // Fetch stations for selected hall
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

  // Fetch food items for all stations of selected hall
  const stationIds = stations.map((s) => s.id);
  const { data: foodItems = [], isLoading: itemsLoading } = useQuery({
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

  // Fetch last scrape log
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

  // Scrape mutation
  const scrapeMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("netnutrition-scrape", {
        body: {},
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast({ title: "Scrape complete", description: data.message });
      queryClient.invalidateQueries();
    },
    onError: (error) => {
      toast({
        title: "Scrape failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Filter food items
  const filteredItems = foodItems.filter((item) => {
    // Search filter
    if (searchQuery && !item.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }

    // Allergen filter (exclude items with selected allergens)
    if (selectedAllergens.length > 0) {
      const itemAllergens = Array.isArray(item.allergens) ? item.allergens as string[] : [];
      const hasAllergen = selectedAllergens.some((a) =>
        itemAllergens.some((ia) => typeof ia === 'string' && ia.toLowerCase().includes(a.toLowerCase()))
      );
      if (hasAllergen) return false;
    }

    // Dietary filter (include only items with selected dietary flags)
    if (selectedDietary.length > 0) {
      const itemDietary = Array.isArray(item.dietary_flags) ? item.dietary_flags as string[] : [];
      const hasDietary = selectedDietary.every((d) =>
        itemDietary.some((id) => typeof id === 'string' && id.toLowerCase().includes(d.toLowerCase()))
      );
      if (!hasDietary) return false;
    }

    return true;
  });

  const getItemsByStation = (stationId: string) =>
    filteredItems.filter((item) => item.station_id === stationId);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Utensils className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-2xl font-bold text-foreground">BSU Dining</h1>
                <p className="text-sm text-muted-foreground">Ball State University Nutrition Dashboard</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {lastScrape && (
                <span className="text-xs text-muted-foreground">
                  Updated: {new Date(lastScrape.scraped_at).toLocaleDateString()}
                </span>
              )}
              <ThemeToggle />
              <Button
                onClick={() => scrapeMutation.mutate()}
                disabled={scrapeMutation.isPending}
                size="sm"
                variant="outline"
              >
                <RefreshCw className={`h-4 w-4 ${scrapeMutation.isPending ? "animate-spin" : ""}`} />
                {scrapeMutation.isPending ? "Scraping..." : "Refresh Data"}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        {/* Search and Filters */}
        <div className="mb-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search food items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <AllergenFilterBar
            selectedAllergens={selectedAllergens}
            selectedDietary={selectedDietary}
            onAllergenChange={setSelectedAllergens}
            onDietaryChange={setSelectedDietary}
          />
        </div>

        {/* No data state */}
        {halls.length === 0 ? (
          <Card className="p-12 text-center">
            <Utensils className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">No Data Yet</h2>
            <p className="text-muted-foreground mb-4">
              Click "Refresh Data" to scrape dining hall information from NetNutrition.
            </p>
            <Button onClick={() => scrapeMutation.mutate()} disabled={scrapeMutation.isPending}>
              <RefreshCw className={`h-4 w-4 ${scrapeMutation.isPending ? "animate-spin" : ""}`} />
              {scrapeMutation.isPending ? "Scraping..." : "Load Dining Data"}
            </Button>
          </Card>
        ) : (
          /* Dining Hall Tabs */
          <Tabs value={activeHall || ""} onValueChange={setSelectedHall}>
            <TabsList className="mb-4 flex-wrap h-auto gap-1">
              {halls.map((hall) => (
                <TabsTrigger key={hall.id} value={hall.id} className="text-xs">
                  {hall.name}
                </TabsTrigger>
              ))}
            </TabsList>

            {halls.map((hall) => (
              <TabsContent key={hall.id} value={hall.id}>
                {stations.length === 0 ? (
                  <Card className="p-8 text-center">
                    <p className="text-muted-foreground">No stations found for {hall.name}</p>
                  </Card>
                ) : (
                  <Accordion type="multiple" className="space-y-2">
                    {stations.map((station) => {
                      const stationItems = getItemsByStation(station.id);
                      return (
                        <AccordionItem key={station.id} value={station.id} className="border rounded-lg px-4">
                          <AccordionTrigger className="hover:no-underline">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{station.name}</span>
                              <Badge variant="secondary" className="text-xs">
                                {stationItems.length} items
                              </Badge>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            {stationItems.length === 0 ? (
                              <p className="py-4 text-sm text-muted-foreground">
                                No items match your filters
                              </p>
                            ) : (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Item</TableHead>
                                    <TableHead>Serving</TableHead>
                                    <TableHead>Allergens</TableHead>
                                    <TableHead>Dietary</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {stationItems.map((item) => (
                                    <>
                                      <TableRow
                                        key={item.id}
                                        className="cursor-pointer hover:bg-muted/50"
                                        onClick={() =>
                                          setExpandedItem(expandedItem === item.id ? null : item.id)
                                        }
                                      >
                                        <TableCell className="font-medium">{item.name}</TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                          {item.serving_size || "—"}
                                        </TableCell>
                                        <TableCell>
                                          <div className="flex flex-wrap gap-1">
                                            {Array.isArray(item.allergens) &&
                                              (item.allergens as string[]).map((a, i) => (
                                                <Badge
                                                  key={i}
                                                  variant="destructive"
                                                  className="text-xs"
                                                >
                                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                                  {typeof a === 'string' ? a.split("(")[0].trim() : String(a)}
                                                </Badge>
                                              ))}
                                          </div>
                                        </TableCell>
                                        <TableCell>
                                          <div className="flex flex-wrap gap-1">
                                            {Array.isArray(item.dietary_flags) &&
                                              (item.dietary_flags as string[]).map((d, i) => (
                                                <Badge
                                                  key={i}
                                                  className="text-xs bg-primary hover:bg-primary/90 text-primary-foreground"
                                                >
                                                  <Leaf className="h-3 w-3 mr-1" />
                                                  {String(d)}
                                                </Badge>
                                              ))}
                                          </div>
                                        </TableCell>
                                      </TableRow>
                                      {expandedItem === item.id && (
                                        <TableRow key={`${item.id}-nutrition`}>
                                          <TableCell colSpan={4} className="p-0">
                                            <NutritionPanel nutrients={item.nutrients} />
                                          </TableCell>
                                        </TableRow>
                                      )}
                                    </>
                                  ))}
                                </TableBody>
                              </Table>
                            )}
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                )}
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>
    </div>
  );
};

export default Index;
