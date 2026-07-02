## Plano de mudanças no Portal VOD

Vou dividir em blocos. Todos serão implementados agora, exceto os que dependem da Evolution API estar 100% conectada (OTP por WhatsApp) — esses ficam prontos no código e ativos assim que a conexão for feita.

### 1. Tela inicial e Auth
- Remover o texto "O primeiro usuário cadastrado se torna administrador".
- Cadastro: **WhatsApp obrigatório** (validação de formato BR).
- Login por **WhatsApp + senha** OU **e-mail + senha** (campo único "WhatsApp ou e-mail").
- Adicionar **"Esqueci minha senha"** → envia código de reset via WhatsApp.
- Adicionar **confirmação de conta por código no WhatsApp** (OTP de 6 dígitos enviado via Evolution API para o número cadastrado).

### 2. Identidade visual
- Paleta trocada para **azul claro** (tons de sky/cyan) como cor primária, mantendo dark premium.
- Nova seção **"Aparência"** no admin com upload de **logo** (armazenada em Storage bucket `branding`).
- Logo aparece no topo do site e nas telas de auth.

### 3. Fluxo de pedido
- Novo campo **"Tipo de solicitação"**: Adição / Atualização / Conserto.
- Ao buscar TMDB (chave `de22da47e31e5dc677391d32e52de55c` será salva como secret), mostrar **capas (posters) grandes em grid** e o cliente clica na capa para selecionar.
- Novo campo **"Formato"** (ex.: 4K, FHD, Dublado, Legendado) — configurável.
- Notificação instantânea ao admin via WhatsApp quando o pedido chega (já existe, será revisada).

### 4. Templates de mensagem editáveis (admin)
Nova tabela `message_templates` com 7 templates iniciais correspondendo exatamente aos textos que você enviou:
- `received` (pedido recebido)
- `analyzing` (em análise)
- `approved` (aprovado)
- `completed` (concluído/adicionado)
- `rejected` (recusado)
- `fixed` (conserto concluído)
- `admin_new_request` (aviso ao admin)

Variáveis substituíveis: `{cliente}`, `{titulo}`, `{tipo}`, `{formato}`, `{obs}`, `{motivo}`.

Nova página **/admin/mensagens** com editor de texto de cada template + preview.

### 5. Banco de dados (migrations)
- `profiles.whatsapp` → NOT NULL, UNIQUE.
- `requests`: adicionar `request_kind` (adicao|atualizacao|conserto), `format` (text).
- Nova tabela `message_templates` (key, content, updated_at) com seed dos textos.
- Nova tabela `otp_codes` (user_id/whatsapp, code_hash, purpose: signup|reset, expires_at, consumed_at).
- Novo bucket `branding` (público) para logo.
- Nova tabela `settings` (key/value) para URL da logo e outras configs.

### 6. Detalhes técnicos
- OTPs de 6 dígitos, validade 10 min, hash bcrypt, rate limit 1/min por número.
- Fluxo cadastro: usuário preenche → recebe OTP no WhatsApp → digita → conta criada e logada.
- Fluxo reset: informa WhatsApp → recebe OTP → define nova senha (usa `supabaseAdmin.auth.admin.updateUserById`).
- Login por WhatsApp: server function busca `profiles.whatsapp` → pega e-mail correspondente → faz `signInWithPassword` normalmente.

### 7. Fora do escopo desta rodada
- Migração para VPS (fazemos depois, como combinado).
- Instalação do Baileys direto no Lovable (não é possível, continua Evolution na VPS).

---

Confirma que posso executar tudo isso?
