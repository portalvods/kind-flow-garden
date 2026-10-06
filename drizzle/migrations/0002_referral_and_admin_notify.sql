CREATE OR REPLACE FUNCTION public.claim_reseller_referral(_reseller uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL OR _reseller = auth.uid() THEN RETURN jsonb_build_object('ok',false); END IF;
  IF NOT public.has_role(_reseller,'revendedor') THEN RETURN jsonb_build_object('ok',false,'error','Link inválido.'); END IF;
  UPDATE public.profiles SET reseller_id = _reseller WHERE id = auth.uid() AND reseller_id IS NULL;
  RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.claim_reseller_referral(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_reseller_referral(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_send_notification(_whatsapp text, _title text, _body text, _link text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _id uuid; _n int;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RETURN jsonb_build_object('ok',false,'error','Acesso negado.'); END IF;
  IF coalesce(trim(_title),'') = '' THEN RETURN jsonb_build_object('ok',false,'error','Informe o título.'); END IF;
  IF coalesce(trim(_whatsapp),'') = '' THEN
    INSERT INTO public.notifications(user_id,title,body,link) SELECT id,_title,nullif(_body,''),nullif(_link,'') FROM public.profiles;
    GET DIAGNOSTICS _n = ROW_COUNT;
  ELSE
    _id := public.find_profile_by_wa(_whatsapp);
    IF _id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Número não cadastrado.'); END IF;
    INSERT INTO public.notifications(user_id,title,body,link) VALUES (_id,_title,nullif(_body,''),nullif(_link,''));
    _n := 1;
  END IF;
  RETURN jsonb_build_object('ok',true,'sent',_n);
END $$;
REVOKE ALL ON FUNCTION public.admin_send_notification(text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_send_notification(text,text,text,text) TO authenticated;