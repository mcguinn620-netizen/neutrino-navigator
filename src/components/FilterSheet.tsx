import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SlidersHorizontal, AlertTriangle, Leaf } from "lucide-react";
import { cn } from "@/lib/utils";

const ALLERGENS = [
  "Gluten",
  "Milk",
  "Soy",
  "Tree Nuts",
  "Peanuts",
  "Eggs",
  "Shellfish",
  "Fish",
  "Pork",
  "Coconut",
  "Sesame seeds",
  "Cross contact may occur-manufacturing/frying",
];
const DIETARY = ["Vegan", "Vegetarian"];

interface FilterSheetProps {
  selectedAllergens: string[];
  selectedDietary: string[];
  onAllergenChange: (a: string[]) => void;
  onDietaryChange: (d: string[]) => void;
}

const FilterSheet = ({
  selectedAllergens,
  selectedDietary,
  onAllergenChange,
  onDietaryChange,
}: FilterSheetProps) => {
  const total = selectedAllergens.length + selectedDietary.length;

  const toggle = (
    list: string[],
    setter: (l: string[]) => void,
    value: string,
  ) =>
    setter(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  const clear = () => {
    onAllergenChange([]);
    onDietaryChange([]);
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative flex flex-col h-auto py-1.5 px-3 min-w-[44px] gap-0.5"
        >
          <SlidersHorizontal className="h-5 w-5" />
          <span className="text-[10px]">Filters</span>
          {total > 0 && (
            <span className="absolute top-0.5 right-1.5 h-4 min-w-[16px] px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
              {total}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl max-h-[85vh] overflow-y-auto pb-safe"
      >
        <SheetHeader className="mb-4">
          <div className="mx-auto w-10 h-1 rounded-full bg-muted -mt-2 mb-3" />
          <SheetTitle className="text-xl">Filters</SheetTitle>
        </SheetHeader>

        <section className="mb-6">
          <h3 className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-3 flex items-center gap-1.5">
            <Leaf className="h-3.5 w-3.5" />
            Dietary preferences
          </h3>
          <div className="flex flex-wrap gap-2">
            {DIETARY.map((d) => {
              const active = selectedDietary.includes(d);
              return (
                <button
                  key={d}
                  onClick={() => toggle(selectedDietary, onDietaryChange, d)}
                  className={cn(
                    "min-h-[44px] px-4 rounded-full border text-sm font-medium transition-all active:scale-95",
                    active
                      ? "bg-success text-success-foreground border-success"
                      : "bg-secondary text-secondary-foreground border-border",
                  )}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </section>

        <section className="mb-6">
          <h3 className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-3 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Exclude allergens
          </h3>
          <div className="flex flex-wrap gap-2">
            {ALLERGENS.map((a) => {
              const active = selectedAllergens.includes(a);
              return (
                <button
                  key={a}
                  onClick={() => toggle(selectedAllergens, onAllergenChange, a)}
                  className={cn(
                    "min-h-[44px] px-4 rounded-full border text-sm font-medium transition-all active:scale-95",
                    active
                      ? "bg-destructive text-destructive-foreground border-destructive"
                      : "bg-secondary text-secondary-foreground border-border",
                  )}
                >
                  {a}
                </button>
              );
            })}
          </div>
        </section>

        <div className="sticky bottom-0 -mx-6 px-6 pt-3 pb-4 bg-background/95 backdrop-blur border-t">
          <Button
            variant="outline"
            onClick={clear}
            disabled={total === 0}
            className="w-full h-12 rounded-full"
          >
            Clear filters {total > 0 && <Badge variant="secondary" className="ml-2">{total}</Badge>}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default FilterSheet;
