-- Create menu_categories table for food categories within stations
CREATE TABLE IF NOT EXISTS public.menu_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (station_id, name)
);

ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view menu categories"
  ON public.menu_categories
  FOR SELECT
  USING (true);

-- Add category_id column to food_items
ALTER TABLE public.food_items
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.menu_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_food_items_category_id ON public.food_items(category_id);
CREATE INDEX IF NOT EXISTS idx_menu_categories_station_id ON public.menu_categories(station_id);