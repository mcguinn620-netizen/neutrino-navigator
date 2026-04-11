import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

interface NutritionPanelProps {
  nutrients: Json;
}

const NutritionPanel = ({ nutrients }: NutritionPanelProps) => {
  const data = (typeof nutrients === "object" && nutrients !== null && !Array.isArray(nutrients))
    ? nutrients as Record<string, string | undefined>
    : {};

  const entries = Object.entries(data).filter(([, v]) => v !== undefined) as [string, string][];

  if (entries.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No nutrition data available
      </div>
    );
  }

  return (
    <Card className="m-2 border-dashed">
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-sm font-semibold">Nutrition Facts</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-1">
          {entries.map(([label, value]) => (
            <div key={label} className="flex justify-between text-sm py-1 border-b border-border/50">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-medium text-foreground">{value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default NutritionPanel;
