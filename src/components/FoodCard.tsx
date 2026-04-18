import { forwardRef } from "react";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Leaf, ChevronDown } from "lucide-react";
import NutritionPanel from "@/components/NutritionPanel";
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

const FoodCard = forwardRef<HTMLDivElement, FoodCardProps>(({
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
  const calories = getNutrient("Calories");
  const protein = getNutrient("Protein");
  const carbs = getNutrient("Total Carbohydrate");
  const fat = getNutrient("Total Fat");
  const hasMacros = calories || protein || carbs || fat;

  return (
    <div
      ref={ref}
      className={cn(
        "rounded-2xl bg-card border border-border/60 shadow-sm transition-all duration-200",
        "active:scale-[0.98]",
        expanded && "shadow-md ring-1 ring-primary/20",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left p-3 min-h-[44px] flex flex-col gap-1.5"
        aria-expanded={expanded}
      >
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-semibold text-sm text-foreground leading-snug line-clamp-2">
            {name}
          </h4>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground shrink-0 mt-0.5 transition-transform duration-200",
              expanded && "rotate-180",
            )}
          />
        </div>

        {servingSize && (
          <p className="text-xs text-muted-foreground">{servingSize}</p>
        )}

        {hasMacros && (
          <div className="flex flex-wrap gap-1 mt-1">
            {calories && (
              <span className="inline-flex items-center rounded-full px-1.5 py-0 h-5 text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                {calories} cal
              </span>
            )}
            {protein && (
              <span className="inline-flex items-center rounded-full px-1.5 py-0 h-5 text-[10px] font-medium bg-bsu-blue/15 text-bsu-blue border border-bsu-blue/25">
                P {protein}
              </span>
            )}
            {carbs && (
              <span className="inline-flex items-center rounded-full px-1.5 py-0 h-5 text-[10px] font-medium bg-bsu-yellow/25 text-foreground border border-bsu-yellow/40">
                C {carbs}
              </span>
            )}
            {fat && (
              <span className="inline-flex items-center rounded-full px-1.5 py-0 h-5 text-[10px] font-medium bg-muted text-muted-foreground border border-border">
                F {fat}
              </span>
            )}
          </div>
        )}

        {(dietaryList.length > 0 || allergenList.length > 0) && (
          <div className="flex flex-wrap gap-1 mt-1">
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
                className="text-[10px] px-1.5 py-0 h-5 gap-0.5"
              >
                <AlertTriangle className="h-2.5 w-2.5" />
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

      {expanded && (
        <div className="border-t border-border/60 px-3 pb-3 pt-2 animate-fade-in">
          {allergenList.length > 0 && (
            <div className="mb-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">
                Allergens
              </p>
              <div className="flex flex-wrap gap-1">
                {allergenList.map((a, i) => (
                  <Badge key={i} variant="destructive" className="text-[10px]">
                    <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                    {typeof a === "string" ? a : String(a)}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {dietaryList.length > 0 && (
            <div className="mb-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">
                Dietary
              </p>
              <div className="flex flex-wrap gap-1">
                {dietaryList.map((d, i) => (
                  <Badge
                    key={i}
                    className="text-[10px] bg-success hover:bg-success text-success-foreground"
                  >
                    <Leaf className="h-2.5 w-2.5 mr-0.5" />
                    {String(d)}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          <div className="-mx-1">
            <NutritionPanel nutrients={nutrients} />
          </div>
        </div>
      )}
    </div>
  );
});
FoodCard.displayName = "FoodCard";

export default FoodCard;
