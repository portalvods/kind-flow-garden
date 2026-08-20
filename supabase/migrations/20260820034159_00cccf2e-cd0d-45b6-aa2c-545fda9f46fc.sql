INSERT INTO public.message_templates (key, label, content) VALUES
('series_updated', 'Série atualizada (conclusão de atualização)', '🔄 Série atualizada!

"{titulo}" foi atualizada: {episodios} episódios adicionados. A série está na categoria "{categoria}".

⏱ Pode levar até 10 a 30 minutos para aparecer no aplicativo. Atualize os conteúdos.'),
('otp_signup', 'Código de confirmação (criar conta)', '🔐 *{site}*

Seu código para confirmação do seu cadastro é:

*{codigo}*

Ele expira em 10 minutos. Se não foi você, ignore esta mensagem.'),
('otp_reset', 'Código de recuperação de conta', '🔐 *{site}*

Seu código para recuperação da sua senha é:

*{codigo}*

Ele expira em 10 minutos. Se não foi você, ignore esta mensagem.')
ON CONFLICT (key) DO NOTHING;