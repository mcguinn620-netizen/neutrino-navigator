import { forwardRef } from "react";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Leaf } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

interface FoodCardProps {
  name: string;
  servingSize: string | null;
  allergens: Json;
  dietaryFlags: Json;
  nutrients: Json;
  expanded: boolean;
  onToggle: () => void;
}

const FoodCard = forwardRef<HTMLButtonElement, FoodCardProps>(({
  name,
  servingSize,
  allergens,
  dietaryFlags,
  nutrients,
  expanded,
  onToggle,
}, ref) => {
  const allergenList = Array.isArray(allergens) ? (allergens as string[]) : [];
  const dietaryList = Array.isArray(dietaryFlags) ? (dietaryFlags as string[]) : [];

  const nutrientObj =
    nutrients && typeof nutrients === "object" && !Array.isArray(nutrients)
      ? (nutrients as Record<string, string | number>)
      : null;

  const getNutrient = (key: string): string | null => {
    if (!nutrientObj) return null;
    const v = nutrientObj[key];
    if (v === undefined || v === null || v === "") return null;
    return String(v);
  };

  // Pull ingredients out (case-insensitive) so it can render full-width at the bottom
  let ingredients: string | null = null;
  const nutrientEntries: [string, string][] = [];
  if (nutrientObj) {
    for (const [k, v] of Object.entries(nutrientObj)) {
      if (v === undefined || v === null || v === "") continue;
      if (k.toLowerCase() === "ingredients") {
        ingredients = String(v);
      } else {
        nutrientEntries.push([k, String(v)]);
      }
    }
  }

  const calories = getNutrient("Calories");
  const protein = getNutrient("Protein");
  const carbs = getNutrient("Total Carbohydrate");
  const fat = getNutrient("Total Fat");
  const hasMacros = calories || protein || carbs || fat;

  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={cn(
          "text-left w-full h-full rounded-2xl bg-card border border-border/60 shadow-sm p-3 min-h-[150px] landscape:min-h-[140px]",
          "flex flex-col gap-1.5 active:scale-[0.97] transition-transform",
        )}
      >
        <h4 className="font-semibold text-sm text-foreground leading-snug line-clamp-2">
          {name}
        </h4>

        {servingSize && (
          <p className="text-[11px] text-muted-foreground line-clamp-1">{servingSize}</p>
        )}

        {hasMacros && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {calories && (
              <span className="inline-flex items-center rounded-full px-1.5 h-5 text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                {calories} cal
              </span>
            )}
            {protein && (
              <span className="inline-flex items-center rounded-full px-1.5 h-5 text-[10px] font-medium bg-bsu-blue/15 text-bsu-blue border border-bsu-blue/25">
                P {protein}
              </span>
            )}
            {carbs && (
              <span className="inline-flex items-center rounded-full px-1.5 h-5 text-[10px] font-medium bg-bsu-yellow/25 text-foreground border border-bsu-yellow/40">
                C {carbs}
              </span>
            )}
            {fat && (
              <span className="inline-flex items-center rounded-full px-1.5 h-5 text-[10px] font-medium bg-muted text-muted-foreground border border-border">
                F {fat}
              </span>
            )}
          </div>
        )}

        {(dietaryList.length > 0 || allergenList.length > 0) && (
          <div className="flex flex-wrap gap-1">
            {dietaryList.slice(0, 2).map((d, i) => (
              <Badge
                key={`d-${i}`}
                className="text-[10px] px-1.5 py-0 h-5 bg-success hover:bg-success text-success-foreground gap-0.5"
              >
                <Leaf className="h-2.5 w-2.5" />
                {String(d)}
              </Badge>
            ))}
            {allergenList.slice(0, 2).map((a, i) => (
              <Badge
                key={`a-${i}`}
                variant="destructive"
                className="text-xs px-2 py-0.5 h-6 gap-1"
              >
                <AlertTriangle className="h-3 w-3" />
                {typeof a === "string" ? a.split("(")[0].trim() : String(a)}
              </Badge>
            ))}
            {allergenList.length + dietaryList.length > 4 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                +{allergenList.length + dietaryList.length - 4}
              </Badge>
            )}
          </div>
        )}
      </button>

      <Dialog open={expanded} onOpenChange={(o) => { if (!o) onToggle(); }}>
        <DialogContent className="max-w-lg w-[calc(100%-2rem)] max-h-[85vh] overflow-y-auto rounded-2xl p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3 text-left">
            <DialogTitle className="text-base font-bold leading-snug pr-6">{name}</DialogTitle>
            {servingSize && (
              <p className="text-xs text-muted-foreground mt-1">{servingSize}</p>
            )}
          </DialogHeader>

          <div className="px-5 pb-5 space-y-4">
            {hasMacros && (
              <div className="flex flex-wrap gap-1.5">
                {calories && (
                  <span className="inline-flex items-center rounded-full px-2 h-6 text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                    {calories} cal
                  </span>
                )}
                {protein && (
                  <span className="inline-flex items-center rounded-full px-2 h-6 text-xs font-medium bg-bsu-blue/15 text-bsu-blue border border-bsu-blue/25">
                    Protein {protein}
                  </span>
                )}
                {carbs && (
                  <span className="inline-flex items-center rounded-full px-2 h-6 text-xs font-medium bg-bsu-yellow/25 text-foreground border border-bsu-yellow/40">
                    Carbs {carbs}
                  </span>
                )}
                {fat && (
                  <span className="inline-flex items-center rounded-full px-2 h-6 text-xs font-medium bg-muted text-muted-foreground border border-border">
                    Fat {fat}
                  </span>
                )}
              </div>
            )}

            {allergenList.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">
                  Allergens
                </p>
                <div className="flex flex-wrap gap-1">
                  {allergenList.map((a, i) => (
                    <Badge key={i} variant="destructive" className="text-[11px]">
                      <AlertTriangle className="h-3 w-3 mr-0.5" />
                      {typeof a === "string" ? a : String(a)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {dietaryList.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">
                  Dietary
                </p>
                <div className="flex flex-wrap gap-1">
                  {dietaryList.map((d, i) => (
                    <Badge
                      key={i}
                      className="text-[11px] bg-success hover:bg-success text-success-foreground"
                    >
                      <Leaf className="h-3 w-3 mr-0.5" />
                      {String(d)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {nutrientEntries.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">
                  Nutrition Facts
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0 rounded-xl border border-border/60 bg-card p-3">
                  {nutrientEntries.map(([label, value]) => (
                    <div
                      key={label}
                      className="flex justify-between text-xs py-1 border-b border-border/40 last:border-b-0"
                    >
                      <span className="text-muted-foreground truncate pr-2">{label}</span>
                      <span className="font-medium text-foreground shrink-0">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {ingredients && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">
                  Ingredients
                </p>
                <p className="text-xs leading-relaxed text-foreground/90 whitespace-normal break-words rounded-xl border border-border/60 bg-muted/30 p-3">
                  {ingredients}
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
});
FoodCard.displayName = "FoodCard";

export default FoodCard;
