
-- Create dining_halls table
CREATE TABLE public.dining_halls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  unit_oid INTEGER NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.dining_halls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view dining halls"
  ON public.dining_halls FOR SELECT
  USING (true);

-- Create stations table
CREATE TABLE public.stations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dining_hall_id UUID NOT NULL REFERENCES public.dining_halls(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit_oid INTEGER NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.stations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view stations"
  ON public.stations FOR SELECT
  USING (true);

-- Create food_items table
CREATE TABLE public.food_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  detail_oid INTEGER NOT NULL UNIQUE,
  serving_size TEXT,
  allergens JSONB NOT NULL DEFAULT '[]'::jsonb,
  dietary_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  nutrients JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.food_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view food items"
  ON public.food_items FOR SELECT
  USING (true);

-- Create scrape_logs table
CREATE TABLE public.scrape_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scraped_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL,
  message TEXT,
  items_count INTEGER DEFAULT 0
);

ALTER TABLE public.scrape_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view scrape logs"
  ON public.scrape_logs FOR SELECT
  USING (true);

-- Create indexes
CREATE INDEX idx_stations_dining_hall ON public.stations(dining_hall_id);
CREATE INDEX idx_food_items_station ON public.food_items(station_id);
CREATE INDEX idx_food_items_allergens ON public.food_items USING GIN(allergens);
CREATE INDEX idx_food_items_dietary ON public.food_items USING GIN(dietary_flags);

-- Timestamp trigger for food_items
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_food_items_updated_at
  BEFORE UPDATE ON public.food_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
