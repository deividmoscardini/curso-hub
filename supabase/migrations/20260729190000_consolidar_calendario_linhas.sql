-- Consolida as 4 tabelas operacionais (ofertas, pa_turmas, provas_sub,
-- fechamentos) numa única `calendario_linhas` com jsonb. Motivo: o motor
-- de regras (_shared/regras.ts) retorna structures ricas (colunas B/C/D/E/G/H
-- em Fechamento, C..P em ProvaSub etc.) que ficam mais estáveis
-- serializadas em jsonb do que espalhadas em 4 schemas diferentes. Também
-- simplifica muito o aplicar-solicitacao (1 upsert em vez de 4 mapping).

drop table if exists public.ofertas cascade;
drop table if exists public.pa_turmas cascade;
drop table if exists public.provas_sub cascade;
drop table if exists public.fechamentos cascade;

create table public.calendario_linhas (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  aba           public.aba_calendario not null,
  ano           int not null,
  ordem         int not null,                            -- entrada (E1..E16) ou oferta (1..N)
  curso_id      uuid references public.cursos(id) on delete cascade,
  disciplina_id uuid references public.disciplinas(id) on delete cascade,
  chave_natural text not null,                           -- ex.: "disciplinas-2027-411-393-E5"
  dados         jsonb not null,                          -- objeto do motor serializado
  conflitos     jsonb not null default '{}'::jsonb,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, chave_natural)
);

create index calendario_linhas_tenant_aba_ano_idx
  on public.calendario_linhas(tenant_id, aba, ano);
create index calendario_linhas_curso_idx
  on public.calendario_linhas(curso_id) where curso_id is not null;
create index calendario_linhas_disciplina_idx
  on public.calendario_linhas(disciplina_id) where disciplina_id is not null;

create trigger trg_calendario_linhas_atualizado_em
  before update on public.calendario_linhas
  for each row execute function public.tocar_atualizado_em();

alter table public.calendario_linhas enable row level security;

create policy calendario_linhas_read on public.calendario_linhas
  for select using (
    public.eh_admin_global()
    or public.tem_papel_no_tenant(
      calendario_linhas.tenant_id,
      array['owner','aprovador','editor','solicitante_interno','solicitante_externo','visualizador']::public.papel_tenant[]
    )
  );

create policy calendario_linhas_write on public.calendario_linhas
  for all using (
    public.eh_admin_global()
    or public.tem_papel_no_tenant(
      calendario_linhas.tenant_id,
      array['owner','editor']::public.papel_tenant[]
    )
  );
