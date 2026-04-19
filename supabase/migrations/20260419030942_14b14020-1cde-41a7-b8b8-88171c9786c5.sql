-- Remove stale North Dining row at unit_oid 21 (correct value is 25) and its
-- dependent stations + items. Also wipe Woodworth Commons (unit_oid 38) so
-- the new menuOid-based Lunch/Dinner split creates clean stations on the
-- next scrape.

-- North Dining (oid 21) cleanup
DELETE FROM public.food_items
WHERE station_id IN (
  SELECT s.id FROM public.stations s
  JOIN public.dining_halls dh ON dh.id = s.dining_hall_id
  WHERE dh.unit_oid = 21
);

DELETE FROM public.menu_categories
WHERE station_id IN (
  SELECT s.id FROM public.stations s
  JOIN public.dining_halls dh ON dh.id = s.dining_hall_id
  WHERE dh.unit_oid = 21
);

DELETE FROM public.stations
WHERE dining_hall_id IN (
  SELECT id FROM public.dining_halls WHERE unit_oid = 21
);

DELETE FROM public.dining_halls WHERE unit_oid = 21;

-- Woodworth Commons (oid 38) cleanup so the new Lunch/Dinner split is clean
DELETE FROM public.food_items
WHERE station_id IN (
  SELECT s.id FROM public.stations s
  JOIN public.dining_halls dh ON dh.id = s.dining_hall_id
  WHERE dh.unit_oid = 38
);

DELETE FROM public.menu_categories
WHERE station_id IN (
  SELECT s.id FROM public.stations s
  JOIN public.dining_halls dh ON dh.id = s.dining_hall_id
  WHERE dh.unit_oid = 38
);

DELETE FROM public.stations
WHERE dining_hall_id IN (
  SELECT id FROM public.dining_halls WHERE unit_oid = 38
);
