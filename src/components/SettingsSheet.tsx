import { useState } from "react";
import { Settings as SettingsIcon, Sun, Moon, Monitor, RefreshCw, Target } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTheme } from "@/components/ThemeProvider";
import { useAppStore } from "@/lib/store";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const SettingsSheet = () => {
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const goals = useAppStore((s) => s.goals);
  const setGoals = useAppStore((s) => s.setGoals);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const scrapeMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("netnutrition-scrape", {
        body: { wipe: true },
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(data?.message || "Refresh failed");
      return data;
    },
    onSuccess: (data) => {
      const dispatched = data?.hallsDispatched ?? 0;
      toast({
        title: "Refresh started",
        description:
          dispatched > 0
            ? `Scraping ${dispatched} dining halls. New data will appear in 1–3 minutes.`
            : data?.message ?? "Refresh started",
      });
      let polls = 0;
      const interval = setInterval(() => {
        polls += 1;
        queryClient.invalidateQueries();
        if (polls >= 24) clearInterval(interval);
      }, 10000);
    },
    onError: (error: Error) =>
      toast({ title: "Refresh failed", description: error.message, variant: "destructive" }),
  });

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="h-9 w-9 rounded-full flex items-center justify-center text-primary-foreground/90 active:bg-white/20"
        aria-label="Settings"
      >
        <SettingsIcon className="h-5 w-5" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl max-h-[90vh] overflow-y-auto pb-safe"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="mx-auto w-10 h-1 rounded-full bg-muted -mt-2 mb-3" />
          <SheetHeader className="mb-5">
            <SheetTitle className="text-xl">Settings</SheetTitle>
          </SheetHeader>

          {/* Nutrition goals */}
          <section className="mb-6">
            <h3 className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-3 flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5" />
              Nutrition goals
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  { key: "calories", label: "Calories", unit: "kcal" },
                  { key: "protein", label: "Protein", unit: "g" },
                  { key: "carbs", label: "Carbs", unit: "g" },
                  { key: "fat", label: "Fat", unit: "g" },
                ] as const
              ).map((g) => (
                <div key={g.key} className="rounded-2xl bg-card border border-border p-3">
                  <Label className="text-xs text-muted-foreground">{g.label}</Label>
                  <div className="flex items-baseline gap-1.5 mt-1">
                    <Input
                      type="number"
                      min={0}
                      value={goals[g.key]}
                      onChange={(e) => setGoals({ [g.key]: Number(e.target.value) || 0 })}
                      className="h-9 text-base font-semibold border-0 bg-transparent px-0 focus-visible:ring-0"
                    />
                    <span className="text-xs text-muted-foreground">{g.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Theme */}
          <section className="mb-6">
            <h3 className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-3">
              Theme
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: "light", label: "Light", icon: Sun },
                  { id: "dark", label: "Dark", icon: Moon },
                  { id: "system", label: "System", icon: Monitor },
                ] as const
              ).map((t) => {
                const Icon = t.icon;
                const active = theme === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                    className={cn(
                      "flex flex-col items-center gap-1 py-3 rounded-2xl border transition-all active:scale-95",
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card border-border text-foreground",
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-xs font-medium">{t.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Database */}
          <section className="mb-2">
            <h3 className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-3">
              Database
            </h3>
            <Button
              onClick={() => scrapeMutation.mutate()}
              disabled={scrapeMutation.isPending}
              variant="outline"
              className="w-full h-12 rounded-2xl gap-2"
            >
              <RefreshCw className={cn("h-4 w-4", scrapeMutation.isPending && "animate-spin")} />
              {scrapeMutation.isPending ? "Refreshing…" : "Refresh database"}
            </Button>
          </section>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default SettingsSheet;
