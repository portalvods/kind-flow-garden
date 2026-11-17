CREATE TABLE public.client_daily_access (
 user_id uuid NOT NULL,
 access_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::date),
 page text NOT NULL,
 views integer NOT NULL DEFAULT 1 CHECK (views > 0),
 last_active_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (user_id, access_date, page),
 CHECK (page IN ('/pedidos','/novidades','/em-alta','/perfil','/suporte','/admin'))
);
GRANT SELECT ON public.client_daily_access TO authenticated;
GRANT ALL ON public.client_daily_access TO service_role;
ALTER TABLE public.client_daily_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_read_client_access ON public.client_daily_access FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX client_daily_access_date_idx ON public.client_daily_access(access_date);
CREATE OR REPLACE FUNCTION public.record_client_access(_page text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 IF _page NOT IN ('/pedidos','/novidades','/em-alta','/perfil','/suporte','/admin') THEN RAISE EXCEPTION 'Invalid page'; END IF;
 INSERT INTO public.client_daily_access(user_id, access_date, page) VALUES (auth.uid(), (now() AT TIME ZONE 'America/Sao_Paulo')::date, _page)
 ON CONFLICT (user_id, access_date, page) DO UPDATE SET views=client_daily_access.views+1,last_active_at=now();
END;
$$;
REVOKE ALL ON FUNCTION public.record_client_access(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_client_access(text) TO authenticated;
CREATE OR REPLACE FUNCTION public.admin_access_summary(_days integer DEFAULT 7) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date; result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF _days NOT IN (1,7,30) THEN RAISE EXCEPTION 'Invalid period'; END IF;
 SELECT jsonb_build_object(
 'today_clients',(SELECT count(DISTINCT user_id) FROM public.client_daily_access WHERE access_date=today),
 'today_views',(SELECT coalesce(sum(views),0) FROM public.client_daily_access WHERE access_date=today),
 'period_clients',(SELECT count(DISTINCT user_id) FROM public.client_daily_access WHERE access_date BETWEEN today-(_days-1) AND today),
 'pages',coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM (SELECT page,sum(views) AS views,count(DISTINCT user_id) AS clients FROM public.client_daily_access WHERE access_date BETWEEN today-(_days-1) AND today GROUP BY page ORDER BY sum(views) DESC,page) p),'[]'::jsonb),
 'daily',coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.date) FROM (SELECT day::date AS date,count(DISTINCT a.user_id) AS clients,coalesce(sum(a.views),0) AS views FROM generate_series((today-(_days-1))::timestamp,today::timestamp,'1 day') day LEFT JOIN public.client_daily_access a ON a.access_date=day::date GROUP BY day) d),'[]'::jsonb)
 ) INTO result;
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_access_summary(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_access_summary(integer) TO authenticated;