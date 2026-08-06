-- Fase 7.1 — Tipo de curso + pre-requisito por disciplina + CH minima por tipo
--
-- Introduz o conceito de "tipo de curso" (Pós-Graduação / Curso Livre /
-- GMP / Diplomado) — necessário porque as regras de negócio mudam por
-- tipo. Pós-Graduação exige CH mínima de 360h; outros tipos não exigem.
--
-- Também adiciona flag de pré-requisito por disciplina (útil no futuro
-- pra travar ordem/dependência), e coluna codigo_externo em disciplinas
-- (pra futura integração com Liceu).

create type public.tipo_curso as enum ('pos_graduacao', 'curso_livre', 'gmp', 'diplomado');

alter table public.cursos
  add column tipo_curso public.tipo_curso;

-- Backfill: cursos existentes são todos pos-graduação (411 PUC RIO COLLAB)
update public.cursos set tipo_curso = 'pos_graduacao' where tipo_curso is null;
alter table public.cursos alter column tipo_curso set not null;

alter table public.disciplinas
  add column tem_pre_requisito boolean not null default false;

alter table public.disciplinas
  add column codigo_externo text;

-- Seed de regras_params por tenant existente: CH mínima por tipo de curso.
-- Regra idealmente lida do banco, mas o frontend tem defaults iguais em
-- src/lib/regras-tipo-curso.ts pra funcionar offline. Se mudar aqui,
-- ajustar lá também.
insert into public.regras_params (tenant_id, chave, valor)
select t.id, 'ch_minima_por_tipo', jsonb_build_object(
  'pos_graduacao', 360,
  'curso_livre', 0,
  'gmp', 0,
  'diplomado', 0
)
from public.tenants t
on conflict (tenant_id, chave) do update set valor = excluded.valor;
