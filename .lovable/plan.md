# Plataforma de Solicitação de Abertura de Cursos

Ferramenta interna para capturar e aprovar pedidos de abertura de novos cursos acadêmicos (domínio +A Educação / PUC Rio COLLAB). Fluxo simples: solicitante preenche → aprovador decide. Sem automação de calendário nesta fase.

## Stack e infraestrutura

- TanStack Start + React 19 + Tailwind v4 + shadcn (já no template).
- Lovable Cloud (Supabase) para Auth, banco e Storage.
- Idioma: português. Layout painel administrativo (sidebar + conteúdo).

## Autenticação e perfis

- Supabase Auth com **e-mail/senha** + **Google** (padrão Lovable Cloud).
- Trigger `on_auth_user_created` cria linha em `perfis` com:
  - `tipo_area = 'externa'`, `papel = 'solicitante'`, `area = ''`, `nome`/`email` do auth.
- Promoção para `interna` / `aprovador` é manual (via painel Supabase). Não há UI para o usuário mudar isso.
- Rota `/auth` pública; app protegido sob `_authenticated/`.

## Estrutura de rotas

```
/                              → landing simples com CTA "Entrar"
/auth                          → login / cadastro
/_authenticated/
  solicitacoes/                → "Minhas solicitações" (lista do usuário)
  solicitacoes/nova            → formulário de nova solicitação
  solicitacoes/$id             → detalhe (dono ou aprovador)
  aprovacao/                   → painel do aprovador (pendentes) — gated por papel
  aprovacao/historico          → decididas
```

Sidebar mostra "Minhas solicitações" sempre; "Painel de aprovação" só se `papel = 'aprovador'`.

## Tela 1 — Nova solicitação

Formulário em duas seções, validado com zod + react-hook-form.

**Dados gerais**
- Nome do curso (texto, obrigatório)
- Instituição parceira (texto, obrigatório)
- Nome e e-mail do solicitante (pré-preenchidos do perfil, editáveis para confirmação)
- Justificativa (textarea, opcional)
- Upload de arquivo `.xlsx` / `.csv` — enviado para bucket privado; salvamos `arquivo_url` (path) e `arquivo_nome_original`. Sem leitura de conteúdo.

**Disciplinas (lista repetível, mínimo 1)**
Botões "Adicionar disciplina" / "Remover". Cada linha:
- Nome da disciplina (texto)
- Carga horária (número)
- Sequência de oferta (número)
- Tipo (select: com/sem pré-requisito)
- Data início captação (date picker)
- Duração pista captação em dias (número)
- Data fim captação (date picker)
- Data início aulas (date picker)
- Tempo de duração da disciplina em dias (número)
- Dias de lives (número)
- Qual semana de live (número)
- Dia da semana da live (select seg–sáb)

Validações: números bloqueiam texto; datas via shadcn DatePicker; nomes alfanuméricos livres.

Após enviar → redireciona para `/solicitacoes/$id` com status "pendente".

**Lista "Minhas solicitações"**: data, nome do curso, nº de disciplinas, status (badge colorido: amarelo pendente / verde aprovado / vermelho rejeitado), link para detalhe.

## Tela 2 — Painel de aprovação

- Aba "Pendentes" (default) e "Histórico".
- Lista ordenada por `criado_em desc`.
- Detalhe abre dados gerais + tabela de disciplinas (todas as colunas) + link de download do arquivo (URL assinada do Storage) + dados do solicitante (nome, e-mail, área, tipo_area).
- Botão **Aprovar** (confirmação simples).
- Botão **Rejeitar** → dialog exigindo `motivo_rejeicao` (textarea obrigatória).
- Decisão aplica-se à solicitação inteira. Registra `aprovado_por`, `aprovado_em`.

## Banco de dados (migração única)

**Enums**: `tipo_area_enum`, `papel_enum`, `status_solicitacao_enum`, `tipo_disciplina_enum`, `dia_semana_enum`.

**Tabelas** (com GRANTs a authenticated + service_role, RLS habilitado):

- `perfis` (id uuid PK → auth.users, nome, email, tipo_area, area, papel, criado_em)
- `solicitacoes_abertura_curso` (id, criado_em, atualizado_em, solicitante_id → perfis, nome_curso, instituicao, nome_solicitante, email_solicitante, justificativa, arquivo_url, arquivo_nome_original, status default 'pendente', aprovado_por → perfis, aprovado_em, motivo_rejeicao)
- `disciplinas_solicitadas` (id, solicitacao_id → solicitacoes ON DELETE CASCADE, + todos os campos da disciplina)

**Função `has_role(uid, papel)` SECURITY DEFINER** para checar aprovador sem recursão.

**Políticas RLS**
- `perfis`: cada um SELECT/UPDATE do próprio; aprovador SELECT em todos.
- `solicitacoes_abertura_curso`:
  - SELECT: dono OR aprovador.
  - INSERT: `solicitante_id = auth.uid()`.
  - UPDATE: aprovador (para decidir).
- `disciplinas_solicitadas`:
  - SELECT/INSERT/DELETE via join no dono da solicitação; aprovador SELECT full.

**Trigger** `handle_new_user()` cria `perfis` como externa/solicitante ao inserir em `auth.users`.

**Storage**: bucket privado `solicitacoes-arquivos`. Políticas em `storage.objects`:
- INSERT: usuário autenticado, path prefixado por `auth.uid()`.
- SELECT: dono do arquivo (path começa com seu uid) OR aprovador.

## Detalhes técnicos

- Client Supabase gerado (`@/integrations/supabase/client`) usado em componentes.
- Server functions em `src/lib/*.functions.ts` com `requireSupabaseAuth` para: criar solicitação (transação: insert em solicitacoes + insert bulk em disciplinas + upload já feito antes no cliente), aprovar, rejeitar, listar histórico do aprovador. Reads simples podem ir direto pelo client com RLS.
- Upload: cliente faz `supabase.storage.from('solicitacoes-arquivos').upload(\`${uid}/${uuid}-${nome}\`, file)` antes do submit; envia o path retornado à server function.
- Download no painel: gerar signed URL via server function (validando papel).
- Head metadata única em cada rota (nada de "Lovable App").
- Sem geração de calendário / lógica de agendamento — fora de escopo.

## Fora de escopo

- Geração automática de calendário 411.
- Notificações por e-mail.
- Edição de solicitação após envio.
- Interface para promover papéis (feito manualmente no Supabase).
