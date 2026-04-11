import { Badge } from "@/components/ui/badge";
import { Filter } from "lucide-react";

const ALLERGENS = [
  "Gluten",
  "Dairy",
  "Soy",
  "Tree Nuts",
  "Peanuts",
  "Egg",
  "Shellfish",
  "Fish",
  "Pork",
];

const DIETARY = ["Vegan", "Vegetarian"];

interface AllergenFilterBarProps {
  selectedAllergens: string[];
  selectedDietary: string[];
  onAllergenChange: (allergens: string[]) => void;
  onDietaryChange: (dietary: string[]) => void;
}

const AllergenFilterBar = ({
  selectedAllergens,
  selectedDietary,
  onAllergenChange,
  onDietaryChange,
}: AllergenFilterBarProps) => {
  const toggleAllergen = (allergen: string) => {
    onAllergenChange(
      selectedAllergens.includes(allergen)
        ? selectedAllergens.filter((a) => a !== allergen)
        : [...selectedAllergens, allergen]
    );
  };

  const toggleDietary = (dietary: string) => {
    onDietaryChange(
      selectedDietary.includes(dietary)
        ? selectedDietary.filter((d) => d !== dietary)
        : [...selectedDietary, dietary]
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Exclude allergens:</span>
        {ALLERGENS.map((allergen) => (
          <Badge
            key={allergen}
            variant={selectedAllergens.includes(allergen) ? "destructive" : "outline"}
            className="cursor-pointer text-xs"
            onClick={() => toggleAllergen(allergen)}
          >
            {allergen}
          </Badge>
        ))}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Dietary:</span>
        {DIETARY.map((d) => (
          <Badge
            key={d}
            variant={selectedDietary.includes(d) ? "default" : "outline"}
            className={`cursor-pointer text-xs ${
              selectedDietary.includes(d) ? "bg-green-600 hover:bg-green-700 text-white" : ""
            }`}
            onClick={() => toggleDietary(d)}
          >
            {d}
          </Badge>
        ))}
      </div>
    </div>
  );
};

export default AllergenFilterBar;
