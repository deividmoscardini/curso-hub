-- Fase 5.2 — Adiciona 2 tipos de solicitação novos usados no wizard
-- /solicitacoes/nova:
--   * novo_curso — criar curso + disciplinas + gerar ofertas do ano de estreia
--   * reordenar_carrossel — reorganizar/substituir/adicionar/remover
--     disciplinas do carrossel de um curso existente.
alter type public.tipo_solicitacao add value if not exists 'novo_curso';
alter type public.tipo_solicitacao add value if not exists 'reordenar_carrossel';
