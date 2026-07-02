REVOKE SELECT ON public.catalog_items FROM authenticated;
GRANT SELECT (category, title, title_normalized, year, kind, tmdb_id) ON public.catalog_items TO authenticated;

CREATE POLICY "Authenticated can read catalog lookup fields" ON public.catalog_items
FOR SELECT
TO authenticated
USING (true);

DROP FUNCTION IF EXISTS public.check_catalog_availability(bigint, text, integer, text);
DROP FUNCTION IF EXISTS public.email_from_whatsapp(text);