-- Fase 8 — Solicitações de alteração de data v2 + histórico por linha
--
-- Fonte: reunião de 6/ago/2026 (Deivid + Bruna).
-- Substitui os tipos genéricos `ajuste_ancora` / `ajuste_manual` (que
-- não batiam com o processo real) por 4 subtipos específicos: live,
-- término, correção do professor e início de disciplina. Também
-- adiciona coluna `comentarios` em calendario_linhas pra registrar
-- o "por quê" de cada alteração visível no calendário.

-- 1) Substituir enum tipo_solicitacao.
--    Postgres não drop-a valor de enum diretamente. Criar novo enum,
--    migrar coluna, dropar antigo, renomear.
create type public.tipo_solicitacao_v2 as enum (
  'gerar_ano',
  'nova_oferta',
  'novo_curso',
  'reordenar_carrossel',
  'cancelar_oferta',
  'alterar_data_live',
  'alterar_data_termino',
  'alterar_data_correcao',
  'alterar_data_inicio'
);

alter table public.solicitacoes
  alter column tipo type public.tipo_solicitacao_v2
  using tipo::text::public.tipo_solicitacao_v2;

drop type public.tipo_solicitacao;
alter type public.tipo_solicitacao_v2 rename to tipo_solicitacao;

-- 2) Histórico visível por linha de calendário.
--    Cada evento tem shape:
--    { criado_em, autor_id, motivo, solicitacao_id,
--      tipo: 'alteracao_solicitacao' | 'admin_edit' | 'admin_delete',
--      chamado?: text,
--      campo_alterado?: text,
--      valor_anterior?: any,
--      valor_novo?: any }
alter table public.calendario_linhas
  add column comentarios jsonb not null default '[]'::jsonb;

create index calendario_linhas_atualizado_idx
  on public.calendario_linhas (atualizado_em desc);
