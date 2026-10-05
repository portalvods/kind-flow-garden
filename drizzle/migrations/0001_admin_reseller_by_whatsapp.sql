CREATE OR REPLACE FUNCTION public.admin_set_reseller_by_wa(_whatsapp text, _make boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RETURN jsonb_build_object('ok',false,'error','Acesso negado.'); END IF;
  _id := public.find_profile_by_wa(_whatsapp);
  IF _id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Número não cadastrado no site. A pessoa precisa criar a conta primeiro.'); END IF;
  IF _id = auth.uid() THEN RETURN jsonb_build_object('ok',false,'error','Não altere seu próprio papel.'); END IF;
  DELETE FROM public.user_roles WHERE user_id = _id AND role IN ('cliente','revendedor');
  INSERT INTO public.user_roles(user_id, role) VALUES (_id, CASE WHEN _make THEN 'revendedor'::app_role ELSE 'cliente'::app_role END) ON CONFLICT DO NOTHING;
  IF NOT _make THEN UPDATE public.profiles SET reseller_id = NULL WHERE reseller_id = _id; END IF;
  RETURN jsonb_build_object('ok',true);
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_set_reseller_by_wa(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_reseller_by_wa(text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_resellers()
RETURNS TABLE(id uuid, full_name text, whatsapp text, clients bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p.id, p.full_name, p.whatsapp, (SELECT count(*) FROM public.profiles c WHERE c.reseller_id = p.id)
  FROM public.profiles p JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'revendedor'
  WHERE public.has_role(auth.uid(),'admin') AND p.deleted_at IS NULL
  ORDER BY p.full_name NULLS LAST
$$;
REVOKE EXECUTE ON FUNCTION public.admin_list_resellers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_resellers() TO authenticated;