## Objetivo
Permitir que o admin cadastre uma ou mais listas M3U. O sistema baixa, faz o parse e indexa todos os filmes e séries. Quando o cliente for pedir (tipo "Adição"), o sistema checa se o título já existe na lista — se existir, bloqueia o pedido e mostra em qual categoria está; se não existir, libera.

## Como vai funcionar (visão do usuário)

**No painel Admin (nova aba "Catálogo M3U"):**
- Campo para colar a URL da lista M3U (ex.: `http://servidor.com/get.php?...&type=m3u_plus`).
- Botão "Sincronizar agora" — baixa e reindexa.
- Sincronização automática configurável (a cada 6h, 12h, 24h — padrão 12h).
- Mostra: total de filmes, total de séries, última sincronização, status (ok / erro).
- Suporte a múltiplas listas (ex.: servidor principal + backup).

**No fluxo de pedido do cliente:**
- Cliente busca o título no TMDB normalmente e seleciona.
- Antes de habilitar o botão "Enviar pedido", o sistema consulta o catálogo local:
  - **Já disponível** → mostra badge verde "Já está no catálogo" + a categoria (ex.: "Filmes › Ação › Dublado") + botão desabilitado com aviso "Se você quer atualização/conserto, mude o tipo de solicitação".
  - **Não encontrado** → libera o botão normalmente.
- Só bloqueia quando o tipo de solicitação for **Adição**. Para **Atualização** ou **Conserto**, permite mesmo se existir (afinal, o cliente quer justamente mexer no que já tem).

## Como o sistema decide se "já existe"
Matching em 3 camadas, do mais forte pro mais fraco:
1. **TMDB ID** (quando a lista M3U trouxer no atributo `tvg-id` ou similar) — match exato.
2. **Título + ano normalizados** (minúsculas, sem acentos, sem pontuação).
3. **Título normalizado** apenas (fallback).

Para séries, considera só o nome da série (ignora S01E01 etc).

## Banco de dados (novas tabelas)

- `m3u_sources` — cada lista cadastrada (url, nome, ativa, intervalo de sync, última sync, status, contadores).
- `catalog_items` — cada item indexado: `source_id`, `kind` (movie/series), `title`, `title_normalized`, `year`, `category` (grupo M3U), `tmdb_id` (quando disponível), `stream_url` (opcional, guardado só pro admin). Índices em `title_normalized` e `tmdb_id` pra busca rápida.

Roles/RLS: só admin lê `m3u_sources` e `stream_url`. Clientes usam apenas um server function que retorna `{ exists: boolean, category: string | null }` — nunca a URL do stream.

## Backend

- `src/lib/m3u.server.ts` — parser de M3U (formato `#EXTINF:-1 tvg-id="..." tvg-name="..." group-title="...",Nome`), normalização de títulos, detector de séries (regex `S\d+ ?E\d+`).
- `src/lib/catalog.functions.ts`:
  - `syncM3uSource({ id })` — admin, baixa a URL, faz parse, faz upsert em lote em `catalog_items`, atualiza contadores.
  - `checkAvailability({ tmdb_id, title, year, kind })` — público (usuário autenticado), retorna `{ exists, category }`.
  - CRUD de `m3u_sources` (create, update, delete, list).
- `createRequest` em `src/lib/requests.functions.ts`: quando `request_kind === "adicao"`, chama `checkAvailability` no servidor antes de inserir. Se `exists`, retorna erro com a categoria.
- **Sync automático**: um endpoint público `/api/public/catalog/sync-cron` (protegido por `CATALOG_CRON_SECRET`) que pode ser chamado por pg_cron ou cron externo no intervalo configurado. Alternativa: sync sob demanda quando abrir o admin + botão manual (mais simples, sem infra extra).

## Frontend

- `src/routes/_authenticated/admin.catalogo.tsx` — nova página: form da URL, lista de fontes, botão sincronizar, estatísticas, log da última sync.
- `src/routes/_authenticated/pedidos.tsx` — ao selecionar um poster do TMDB, dispara `checkAvailability` e mostra badge + bloqueia botão conforme regra acima.
- Link "Catálogo M3U" no menu admin.

## Fora do escopo desta rodada
- Player embutido pra testar o stream (pode entrar depois).
- Import de EPG/XMLTV.
- Verificação se o link do stream está online (só indexa metadados).

## Perguntas antes de começar
1. Você já tem uma URL M3U de teste que eu possa usar para validar o parser? (não precisa ser real agora, só pra referência do formato)
2. Prefere **sync automático via cron** (mais robusto, precisa configurar 1 vez) ou **manual + a cada abertura do admin** (mais simples, sem cron)?
3. O bloqueio deve ser **rígido** (impossível pedir se já existe) ou **avisar mas deixar o cliente prosseguir** clicando "pedir mesmo assim"?
