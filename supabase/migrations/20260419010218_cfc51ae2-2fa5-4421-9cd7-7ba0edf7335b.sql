-- Remove stale Woodworth Commons row (wrong unit_oid 27) and its dependent station/items.
-- The hall will be re-created with the correct unit_oid (38) on the next scrape.
DELETE FROM public.food_items
WHERE station_id IN (
  SELECT s.id FROM public.stations s
  JOIN public.dining_halls dh ON dh.id = s.dining_hall_id
  WHERE dh.unit_oid = 27 AND dh.name ILIKE '%woodworth%'
);

DELETE FROM public.stations
WHERE dining_hall_id IN (
  SELECT id FROM public.dining_halls
  WHERE unit_oid = 27 AND name ILIKE '%woodworth%'
);

DELETE FROM public.dining_halls
WHERE unit_oid = 27 AND name ILIKE '%woodworth%';