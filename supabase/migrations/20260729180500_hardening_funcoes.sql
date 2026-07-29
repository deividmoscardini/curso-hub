-- Endurece as funções criadas na migration anterior:
-- 1. Fixa search_path do tocar_atualizado_em (lint 0011)
-- 2. Revoga EXECUTE das funções SECURITY DEFINER — a RLS chama internamente,
--    o GRANT só afeta chamadas via /rest/v1/rpc/*, que não queremos expor
--    (lint 0028/0029).
alter function public.tocar_atualizado_em() set search_path = public;

revoke execute on function public.eh_admin_global()
  from public, anon, authenticated;
revoke execute on function public.handle_new_user()
  from public, anon, authenticated;
revoke execute on function public.papeis_no_tenant(uuid)
  from public, anon, authenticated;
revoke execute on function public.tem_papel_no_tenant(uuid, public.papel_tenant[])
  from public, anon, authenticated;
