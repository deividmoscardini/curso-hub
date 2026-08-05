-- Corrige dois bugs de RLS descobertos no teste E2E de 2026-07-31:
--
-- 1. A migration 20260729180500_hardening_funcoes.sql revogou EXECUTE
--    de authenticated nas 3 funcoes helper usadas dentro das policies.
--    Postgres exige EXECUTE mesmo em SECURITY DEFINER — sem isso, toda
--    query em perfis/tenants/cursos/etc falha com "permission denied
--    for function eh_admin_global".
--
-- 2. A policy membros_select_do_tenant criada em 20260729180000 fazia
--    um SELECT sobre membros dentro da propria RLS de membros, sem
--    usar SECURITY DEFINER pra bypassar. Resultado: "infinite recursion
--    detected in policy for relation members".

-- FIX 1: grants
grant execute on function public.eh_admin_global() to authenticated;
grant execute on function public.papeis_no_tenant(uuid) to authenticated;
grant execute on function public.tem_papel_no_tenant(uuid, public.papel_tenant[]) to authenticated;
-- handle_new_user permanece revogada (chamada apenas pelo trigger interno)

-- FIX 2: policy recursiva
drop policy if exists membros_select_do_tenant on public.membros;
create policy membros_select_do_tenant on public.membros
  for select using (
    perfil_id = auth.uid()
    or public.eh_admin_global()
    or public.tem_papel_no_tenant(membros.tenant_id, array['owner']::public.papel_tenant[])
  );
