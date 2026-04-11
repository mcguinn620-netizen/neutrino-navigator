

## BSU NetNutrition Dashboard

### What We're Building
A dining hall nutrition dashboard for Ball State University that scrapes data from the NetNutrition site and displays it with allergen and dietary filters.

### How the NetNutrition Site Works
The site is an ASP.NET app with these internal API endpoints (session-based, returns HTML fragments):
- `POST /Unit/SelectUnitFromSideBar` (unitOid) — lists stations for a dining hall
- `POST /Unit/SelectUnitFromChildUnitsList` (unitOid) — lists food items for a station
- `POST /Menu/SelectItem` (detailOid) — selects a food item
- `POST /NutritionDetail/ShowMenuDetailNutritionGrid` — returns nutrition data

Dining halls: The Atrium, Atrium Cafe, Noyer, Student Center Tally, North Dining, Woodworth Commons, Bookmark Cafe, Tom John Food Shop. Each has stations (e.g. Grill, Salad Bar, Maka Mia) identified by numeric IDs. Food items have allergen icons (Gluten, Soy, Pork, etc.) and full nutrition facts (calories, fat, protein, carbs, vitamins, etc.).

### Architecture

```text
NetNutrition Site ──► Supabase Edge Function (scraper) ──► Supabase DB (cache)
                                                                  │
                                                          React Dashboard
```

### Prerequisites
- **Lovable Cloud / Supabase** must be enabled (for edge functions + database)

### Implementation Steps

**Step 1: Enable Lovable Cloud and create database tables**
- `dining_halls` — id, name, unit_oid
- `stations` — id, dining_hall_id, name, unit_oid
- `food_items` — id, station_id, name, detail_oid, serving_size, allergens (jsonb), nutrients (jsonb)
- `scrape_logs` — id, scraped_at, status

**Step 2: Create scraper edge function (`netnutrition-scrape`)**
- Establishes a session with the NetNutrition site
- Iterates through all dining halls → stations → food items
- Parses HTML responses to extract: item names, allergen icons (Gluten, Soy, Pork, Dairy, etc.), serving sizes, detail OIDs
- For each item, fetches nutrition grid and parses all nutrient values
- Upserts everything into the database
- Supports full refresh or single dining hall refresh

**Step 3: Build the React dashboard**
- **Dining Hall Selector** — tabs or sidebar to pick a dining hall
- **Station View** — accordion/cards showing stations within the selected hall
- **Food Item List** — table showing items with allergen badges and serving sizes
- **Nutrition Detail Panel** — expandable view with full nutrition facts per item
- **Filter Bar** — filter by allergens (Gluten, Dairy, Soy, Tree Nuts, Peanuts, Egg, Shellfish, Fish) and dietary preferences (Vegan, Vegetarian)
- **Refresh Button** — triggers on-demand scrape via edge function
- **Last Updated** indicator from scrape_logs

**Step 4: Styling and UX**
- Color-coded allergen badges (red for major allergens, green for vegan/vegetarian)
- Responsive layout for mobile use
- Search bar to find specific food items across all halls

### Technical Details
- The scraper must maintain cookies across requests (ASP.NET session). Edge functions can do this with manual cookie handling via `fetch`.
- HTML parsing in the edge function will use regex/string parsing (no DOM parser in Deno) to extract item names, allergen image titles, and nutrition values from the table cells.
- Allergens are identified by `img` tag `title` attributes: "Gluten (wheat, rye, barley, oats)", "Soy", "Pork", plus dietary icons like "Vegan" (V) and "Vegetarian" (V+).
- Nutrition data includes: Calories, Fat, Sat Fat, Cholesterol, Sodium, Potassium, Carbs, Fiber, Sugars, Protein, plus vitamins (A, C, Calcium, Iron, Niacin, Magnesium, Thiamin, Riboflavin).

