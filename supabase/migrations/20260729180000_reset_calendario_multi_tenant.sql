-- =============================================================================
-- Migration: Reset multi-tenant do calendário acadêmico
-- Fase 1 do plano em .claude/plans/eu-estou-tentando-criar-sorted-scott.md
--
-- Descarta o schema anterior de "solicitação de abertura de curso" (que foi
-- gerado pelo Lovable, apontando pra outro Supabase) e cria o modelo real:
-- tenants (produtos), papeis por tenant, entidades reais do calendário
-- (cursos, disciplinas, ofertas, PA, prova sub, fechamento, feriados,
-- âncoras), camada de solicitações agnóstica e log de auditoria.
--
-- Este é o schema BASE. As tabelas ficam vazias (sem seed de dados do 411)
-- — a Fase 2 importa a planilha do 411 e popula tudo.
-- =============================================================================

-- =========================================================================
-- 1. Cleanup: remove qualquer estado da tentativa anterior (Lovable Cloud)
-- =========================================================================
-- Estas tabelas/enums não existem no Supabase direto (projeto novo), mas
-- estamos aplicando drop-if-exists por segurança e reprodutibilidade —
-- assim a migration pode ser reaplicada em qualquer branch.

drop table if exists public.disciplinas_solicitadas cascade;
drop table if exists public.solicitacoes_abertura_curso cascade;
drop table if exists public.perfis cascade;
drop type if exists public.papel_enum cascade;
drop type if exists public.tipo_area_enum cascade;
drop type if exists public.status_enum cascade;
drop type if exists public.tipo_disciplina_enum cascade;
drop type if exists public.dia_da_semana_enum cascade;
drop function if exists public.tem_papel(uuid, public.papel_enum) cascade;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.set_atualizado_em() cascade;


-- =========================================================================
-- 2. Perfis (1 linha por usuário auth) + bootstrap de admin
-- =========================================================================
-- `admin_global` = true dá bypass de RLS em qualquer tenant. Usado pela
-- +A para gerenciar a plataforma. Solicitantes normais têm admin_global
-- = false; papeis específicos ficam em `membros` por tenant.

create table public.perfis (
  id            uuid primary key references auth.users(id) on delete cascade,
  nome          text not null,
  email         text not null unique,
  admin_global  boolean not null default false,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.perfis is
  'Perfil global de cada usuário. admin_global=true = pode tudo em todos os tenants.';

-- Lista de emails que viram admin_global automaticamente no primeiro login.
-- Usado só no bootstrap — depois disso, admin_global vira via UI.
create table public.bootstrap_admins (
  email text primary key
);

insert into public.bootstrap_admins (email) values
  ('dmartins@maisaedu.com.br');


-- =========================================================================
-- 3. Tenants (produtos) + membros + convites
-- =========================================================================
-- Cada tenant = 1 produto/parceiro (411 PUC RIO COLLAB, FDC, ESPM, etc.).
-- `brand_slug` liga o tenant à identidade visual (public/brands/<slug>/).

create table public.tenants (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  nome          text not null,
  brand_slug    text not null,
  descricao     text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.tenants is
  'Cada tenant é um produto/parceiro (411 PUC RIO COLLAB, FDC, ESPM etc.). '
  'brand_slug resolve pra public/brands/<slug>/ no front.';

create type public.papel_tenant as enum (
  'owner',                -- gerencia membros do tenant, aprova, edita
  'aprovador',            -- aprova/rejeita pedidos, vê diff
  'editor',               -- edita entidades direto (auditado)
  'solicitante_interno',  -- +A: abre pedidos, vê tudo do tenant
  'solicitante_externo',  -- parceiro: abre pedidos, RLS bloqueia sensíveis
  'visualizador'          -- só lê calendário
);

create table public.membros (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  perfil_id    uuid not null references public.perfis(id) on delete cascade,
  papel        public.papel_tenant not null,
  criado_em    timestamptz not null default now(),
  unique (tenant_id, perfil_id)
);

comment on table public.membros is
  'N-para-N entre perfis e tenants, com papel específico. 1 usuário pode '
  'ter papeis diferentes em tenants diferentes.';

create index membros_tenant_idx on public.membros(tenant_id);
create index membros_perfil_idx on public.membros(perfil_id);

create table public.convites (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  email        text not null,
  papel        public.papel_tenant not null,
  convidado_por uuid references public.perfis(id) on delete set null,
  criado_em    timestamptz not null default now(),
  aceito_em    timestamptz,
  unique (tenant_id, email)
);

comment on table public.convites is
  'Convite pendente por email + papel. Aceito automaticamente pelo trigger '
  'handle_new_user quando o email se cadastra.';


-- =========================================================================
-- 4. Cursos + disciplinas (catálogo mestre por tenant)
-- =========================================================================

create type public.status_curso as enum (
  'em_andamento',
  'cancelado',
  'descontinuado'
);

create table public.cursos (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  codigo         text not null,   -- ex.: "411-393"
  sigla          text not null,   -- ex.: "SM"
  escola         text,
  nome           text not null,
  status         public.status_curso not null default 'em_andamento',
  flags_prontidao jsonb not null default '{}'::jsonb, -- ex.: {"turmas_2026":true,"pa_2027":false}
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  unique (tenant_id, codigo)
);

create index cursos_tenant_idx on public.cursos(tenant_id);

create type public.tipo_oferta as enum ('A', 'C'); -- A=exclusiva, C=compartilhada

create table public.disciplinas (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  curso_id       uuid not null references public.cursos(id) on delete cascade,
  ordem_carrossel int not null,  -- 1..N, posição fixa no carrossel do curso
  nome           text not null,
  ch             int,             -- carga horária (20 ou 24)
  tipo_oferta    public.tipo_oferta not null default 'A',
  observacoes    text,
  criado_em      timestamptz not null default now(),
  unique (curso_id, ordem_carrossel)
);

create index disciplinas_tenant_idx on public.disciplinas(tenant_id);
create index disciplinas_curso_idx on public.disciplinas(curso_id);


-- =========================================================================
-- 5. Entidades operacionais (as 4 abas gerenciáveis do calendário)
-- =========================================================================

create type public.aba_calendario as enum (
  'disciplinas',
  'projeto_aplicacao',
  'prova_substitutiva',
  'fechamento'
);

create type public.dia_semana as enum (
  'segunda','terca','quarta','quinta','sexta','sabado','domingo'
);

-- 5.1 Ofertas (aba Disciplinas: 1 linha = 1 oferta de disciplina numa janela)
create table public.ofertas (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  curso_id           uuid not null references public.cursos(id) on delete cascade,
  disciplina_id      uuid not null references public.disciplinas(id) on delete cascade,
  ano                int not null,       -- ciclo de oferta
  entrada            text not null,      -- "E1", "E2", ...
  inicio_captacao    date,
  termino_captacao   date,
  data_inicio        date not null,
  data_fim           date not null,
  codigo_turma       text,               -- [cod_disc]_[AAAA]0_[XX]
  dia_live           public.dia_semana,
  live_semana_2      date,
  live_semana_3      date,
  questionario       date,
  observacoes        text,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);

create index ofertas_tenant_ano_idx on public.ofertas(tenant_id, ano);
create index ofertas_curso_ano_idx on public.ofertas(curso_id, ano, entrada);

-- 5.2 Projeto de Aplicação (aba PA: cronograma da etapa final por curso/ano)
create table public.pa_turmas (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public.tenants(id) on delete cascade,
  curso_id               uuid not null references public.cursos(id) on delete cascade,
  ano                    int not null,
  entrada                text not null,
  data_inicio            date not null,
  data_fim               date not null,
  live_1                 date,
  live_2                 date,
  data_limite_enturmacao date,   -- coluna J — não é fórmula do arquivo original
  bloco_feedback         jsonb,  -- colunas N–U (feedback + entrega final)
  observacoes            text,
  criado_em              timestamptz not null default now(),
  atualizado_em          timestamptz not null default now()
);

create index pa_turmas_tenant_ano_idx on public.pa_turmas(tenant_id, ano);
create index pa_turmas_curso_ano_idx on public.pa_turmas(curso_id, ano);

-- 5.3 Prova Substitutiva (aba: cronograma por ano/oferta)
create table public.provas_sub (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  ano                 int not null,
  oferta_num          int not null,
  abertura_servico    date,
  fechamento_servico  date,
  analise_protocolos  date,
  parametrizacao      date,
  aplicacao           date,
  envio_notas         date,
  encerramento_protocolos date,
  observacoes         text,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),
  unique (tenant_id, ano, oferta_num)
);

create index provas_sub_tenant_ano_idx on public.provas_sub(tenant_id, ano);

-- 5.4 Fechamento de turmas (aba: calendário mestre, ancora o PA)
create table public.fechamentos (
  id                        uuid primary key default gen_random_uuid(),
  tenant_id                 uuid not null references public.tenants(id) on delete cascade,
  ano                       int not null,
  data_inicio_pa            date,
  data_fim_pa               date,
  encerramento_protocolos   date,
  envio_relacao_turmas_ra   date,
  chamado_freshdesk         text,
  observacoes               text,
  criado_em                 timestamptz not null default now(),
  atualizado_em             timestamptz not null default now()
);

create index fechamentos_tenant_ano_idx on public.fechamentos(tenant_id, ano);


-- =========================================================================
-- 6. Config por tenant (feriados, âncoras, regras)
-- =========================================================================

create type public.escopo_feriado as enum ('nacional', 'estadual', 'municipal');

create table public.feriados (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  data          date not null,
  nome          text not null,
  escopo        public.escopo_feriado not null default 'nacional',
  regiao        text,   -- ex.: "RJ", "Rio de Janeiro" (livre)
  observacoes   text,
  unique (tenant_id, data, nome)
);

create index feriados_tenant_data_idx on public.feriados(tenant_id, data);

create table public.ancoras (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  ano          int not null,
  aba          public.aba_calendario not null,
  data         date not null,
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, ano, aba)
);

comment on table public.ancoras is
  'Data-âncora por ano/aba — substitui anchors.yaml do motor Python.';

create table public.regras_params (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  chave        text not null,
  valor        jsonb not null,
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, chave)
);

comment on table public.regras_params is
  'Override de parâmetros do motor por tenant. Ex.: janela_captacao_dias, '
  'offset_live_semana_2 etc. Motor consulta e cai no default se não achar.';


-- =========================================================================
-- 7. Solicitações (camada de mudanças agnóstica) + comentários
-- =========================================================================

create type public.tipo_solicitacao as enum (
  'gerar_ano',        -- gera ano inteiro de uma aba
  'nova_oferta',      -- adiciona 1 oferta específica
  'ajuste_ancora',    -- muda âncora de um ano/aba já existente
  'ajuste_manual',    -- edição pontual (célula ou linha)
  'cancelar_oferta'   -- remove uma oferta
);

create type public.status_solicitacao as enum (
  'pendente',       -- criada, aguardando revisão
  'em_revisao',     -- alguém está olhando
  'aprovada',       -- decisão de aprovar dada; aguarda aplicação
  'aplicada',       -- gravada nas tabelas reais
  'rejeitada',      -- rejeitada com motivo
  'devolvida'       -- devolvida pro solicitante ajustar
);

create table public.solicitacoes (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  solicitante_id  uuid not null references public.perfis(id),
  tipo            public.tipo_solicitacao not null,
  aba             public.aba_calendario,
  ano             int,
  curso_id        uuid references public.cursos(id),
  payload         jsonb not null,       -- parâmetros do form (validados por Zod no front)
  previa          jsonb,                -- resultado do motor (linhas geradas)
  diff            jsonb,                -- linhas a criar/alterar/remover
  status          public.status_solicitacao not null default 'pendente',
  revisado_por    uuid references public.perfis(id),
  aprovado_por    uuid references public.perfis(id),
  aprovado_em     timestamptz,
  motivo_rejeicao text,
  aplicado_em     timestamptz,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create index solicitacoes_tenant_status_idx on public.solicitacoes(tenant_id, status);
create index solicitacoes_solicitante_idx on public.solicitacoes(solicitante_id);

create table public.solicitacao_comentarios (
  id             uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null references public.solicitacoes(id) on delete cascade,
  autor_id       uuid not null references public.perfis(id),
  texto          text not null,
  interno        boolean not null default false, -- true = só solicitantes internos veem
  criado_em      timestamptz not null default now()
);

create index sol_com_solicitacao_idx on public.solicitacao_comentarios(solicitacao_id);


-- =========================================================================
-- 8. Log de auditoria
-- =========================================================================

create table public.log_auditoria (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid references public.tenants(id) on delete cascade,
  ator_id      uuid references public.perfis(id),
  acao         text not null,        -- ex.: "editor.update", "solicitacao.aplicar", "planilha.importar"
  entidade     text,                 -- ex.: "ofertas", "solicitacoes"
  entidade_id  uuid,
  antes        jsonb,
  depois       jsonb,
  motivo       text,
  criado_em    timestamptz not null default now()
);

create index log_auditoria_tenant_criado_idx on public.log_auditoria(tenant_id, criado_em desc);


-- =========================================================================
-- 9. Triggers utilitários
-- =========================================================================

create or replace function public.tocar_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'perfis','tenants','cursos','ofertas','pa_turmas','provas_sub',
      'fechamentos','ancoras','regras_params','solicitacoes'
    ])
  loop
    execute format(
      'create trigger trg_%1$s_atualizado_em '
      'before update on public.%1$s '
      'for each row execute function public.tocar_atualizado_em();',
      t
    );
  end loop;
end$$;


-- =========================================================================
-- 10. Handle new user: cria perfil + aceita convites + bootstrap admin
-- =========================================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  eh_bootstrap boolean;
begin
  -- Cria perfil
  insert into public.perfis (id, nome, email, admin_global)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', new.email),
    new.email,
    exists (select 1 from public.bootstrap_admins where email = new.email)
  );

  -- Aceita convites pendentes para esse email
  insert into public.membros (tenant_id, perfil_id, papel)
  select c.tenant_id, new.id, c.papel
    from public.convites c
   where c.email = new.email
     and c.aceito_em is null;

  update public.convites
     set aceito_em = now()
   where email = new.email
     and aceito_em is null;

  return new;
end;
$$;

drop trigger if exists trg_criar_perfil_novo_usuario on auth.users;
create trigger trg_criar_perfil_novo_usuario
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- =========================================================================
-- 11. Helpers de autorização + RLS
-- =========================================================================

create or replace function public.eh_admin_global()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select admin_global from public.perfis where id = auth.uid()),
    false
  );
$$;

-- Papeis que o usuário atual tem no tenant (array).
create or replace function public.papeis_no_tenant(p_tenant uuid)
returns public.papel_tenant[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(papel), array[]::public.papel_tenant[])
    from public.membros
   where tenant_id = p_tenant and perfil_id = auth.uid();
$$;

-- True se o usuário atual tem qualquer um dos papeis dados no tenant.
create or replace function public.tem_papel_no_tenant(p_tenant uuid, p_papeis public.papel_tenant[])
returns boolean language sql stable security definer set search_path = public as $$
  select public.eh_admin_global()
      or exists (
        select 1 from public.membros
         where tenant_id = p_tenant
           and perfil_id = auth.uid()
           and papel = any(p_papeis)
      );
$$;

-- Habilita RLS em todas as tabelas que precisam
alter table public.perfis                  enable row level security;
alter table public.tenants                 enable row level security;
alter table public.membros                 enable row level security;
alter table public.convites                enable row level security;
alter table public.cursos                  enable row level security;
alter table public.disciplinas             enable row level security;
alter table public.ofertas                 enable row level security;
alter table public.pa_turmas               enable row level security;
alter table public.provas_sub              enable row level security;
alter table public.fechamentos             enable row level security;
alter table public.feriados                enable row level security;
alter table public.ancoras                 enable row level security;
alter table public.regras_params           enable row level security;
alter table public.solicitacoes            enable row level security;
alter table public.solicitacao_comentarios enable row level security;
alter table public.log_auditoria           enable row level security;
alter table public.bootstrap_admins        enable row level security;

-- bootstrap_admins: só admin_global vê e mexe
create policy bootstrap_admins_admin on public.bootstrap_admins
  for all using (public.eh_admin_global());

-- perfis: cada um vê o próprio, admins veem tudo
create policy perfis_select_proprio on public.perfis
  for select using (id = auth.uid() or public.eh_admin_global());
create policy perfis_update_proprio on public.perfis
  for update using (id = auth.uid() or public.eh_admin_global());

-- tenants: qualquer membro do tenant vê; só admin/owner mexe
create policy tenants_select_membro on public.tenants
  for select using (
    public.eh_admin_global()
    or exists (
      select 1 from public.membros
       where tenant_id = tenants.id and perfil_id = auth.uid()
    )
  );
create policy tenants_all_admin on public.tenants
  for all using (
    public.eh_admin_global()
    or public.tem_papel_no_tenant(tenants.id, array['owner']::public.papel_tenant[])
  );

-- membros: membros do tenant se veem; só admin/owner do tenant altera
create policy membros_select_do_tenant on public.membros
  for select using (
    public.eh_admin_global()
    or exists (
      select 1 from public.membros m2
       where m2.tenant_id = membros.tenant_id and m2.perfil_id = auth.uid()
    )
  );
create policy membros_write_admin on public.membros
  for all using (
    public.eh_admin_global()
    or public.tem_papel_no_tenant(membros.tenant_id, array['owner']::public.papel_tenant[])
  );

-- convites: só admin/owner do tenant
create policy convites_admin on public.convites
  for all using (
    public.eh_admin_global()
    or public.tem_papel_no_tenant(convites.tenant_id, array['owner']::public.papel_tenant[])
  );

-- Entidades do calendário (cursos, disciplinas, ofertas, pa, prova, fechamento,
-- feriados, ancoras, regras_params): membros do tenant leem; papeis de escrita
-- escrevem. Aplicamos o mesmo padrão em bloco via SQL dinâmico.
do $$
declare
  t text;
  ler_papeis text := 'array[''owner'',''aprovador'',''editor'',''solicitante_interno'',''solicitante_externo'',''visualizador'']::public.papel_tenant[]';
  esc_papeis text := 'array[''owner'',''editor'']::public.papel_tenant[]';
begin
  for t in
    select unnest(array[
      'cursos','disciplinas','ofertas','pa_turmas','provas_sub',
      'fechamentos','feriados','ancoras','regras_params'
    ])
  loop
    execute format(
      'create policy %1$s_read on public.%1$s
         for select using (
           public.eh_admin_global()
           or public.tem_papel_no_tenant(%1$s.tenant_id, %2$s)
         );',
      t, ler_papeis
    );
    execute format(
      'create policy %1$s_write on public.%1$s
         for all using (
           public.eh_admin_global()
           or public.tem_papel_no_tenant(%1$s.tenant_id, %2$s)
         );',
      t, esc_papeis
    );
  end loop;
end$$;

-- solicitacoes: solicitantes veem as próprias, aprovadores/owners veem todas
create policy solicitacoes_select on public.solicitacoes
  for select using (
    public.eh_admin_global()
    or solicitante_id = auth.uid()
    or public.tem_papel_no_tenant(
      tenant_id,
      array['owner','aprovador','editor']::public.papel_tenant[]
    )
  );
create policy solicitacoes_insert on public.solicitacoes
  for insert with check (
    public.eh_admin_global()
    or public.tem_papel_no_tenant(
      tenant_id,
      array['owner','aprovador','editor','solicitante_interno','solicitante_externo']::public.papel_tenant[]
    )
  );
create policy solicitacoes_update on public.solicitacoes
  for update using (
    public.eh_admin_global()
    or public.tem_papel_no_tenant(
      tenant_id, array['owner','aprovador','editor']::public.papel_tenant[]
    )
    or (solicitante_id = auth.uid() and status in ('pendente','devolvida'))
  );

-- comentários: quem enxerga a solicitação enxerga o comentário; interno filtra externos
create policy sol_com_select on public.solicitacao_comentarios
  for select using (
    exists (
      select 1 from public.solicitacoes s
       where s.id = solicitacao_id
         and (
           public.eh_admin_global()
           or s.solicitante_id = auth.uid()
           or public.tem_papel_no_tenant(
             s.tenant_id, array['owner','aprovador','editor','solicitante_interno']::public.papel_tenant[]
           )
           or (not interno and public.tem_papel_no_tenant(
             s.tenant_id, array['solicitante_externo','visualizador']::public.papel_tenant[]
           ))
         )
    )
  );
create policy sol_com_insert on public.solicitacao_comentarios
  for insert with check (autor_id = auth.uid());

-- log_auditoria: só admin global e owner do tenant leem; ninguém escreve via API (só via edge functions com service role)
create policy log_auditoria_read on public.log_auditoria
  for select using (
    public.eh_admin_global()
    or (tenant_id is not null and public.tem_papel_no_tenant(
      tenant_id, array['owner']::public.papel_tenant[]
    ))
  );


-- =========================================================================
-- 12. Seed: cria o tenant 411 PUC RIO COLLAB (sem dados ainda — Fase 2)
-- =========================================================================

insert into public.tenants (slug, nome, brand_slug, descricao) values
  (
    '411-puc-rio-collab',
    '411 PUC RIO COLLAB',
    'puc-rio-collab',
    'Pós-graduação em parceria PUC Rio + plataforma. 18 cursos, modelo de entradas contínuas com carrossel de disciplinas.'
  );
