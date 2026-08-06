-- Fase 6.B1 — Acesso multi-tenant automático
--
-- Todo usuário @maisaedu.com.br aprovado tem acesso a TODOS os tenants
-- da plataforma com o mesmo papel. Não mais atribuição por tenant no
-- momento da aprovação. Simplifica a UX (admin escolhe UM papel só,
-- aplica a tudo).

-- 1. Backfill: usuários aprovados atuais viram membros de todos os
--    tenants existentes como 'solicitante_interno' (papel padrão pra
--    quem já está dentro). Admin_global não precisa de membros porque
--    já bypassa via eh_admin_global().
insert into public.membros (tenant_id, perfil_id, papel)
select t.id, p.id, 'solicitante_interno'::public.papel_tenant
  from public.tenants t
  cross join public.perfis p
 where p.status = 'aprovado'
   and p.admin_global = false
on conflict (tenant_id, perfil_id) do nothing;

-- 2. Trigger: quando um tenant novo é criado (via backoffice), replica
--    todos os usuários aprovados atuais como membros com papel
--    'visualizador' (default conservador; admin pode promover depois
--    via drawer da tela de usuários).
create or replace function public.apos_tenant_novo_replicar_membros()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.membros (tenant_id, perfil_id, papel)
  select new.id, p.id, 'visualizador'::public.papel_tenant
    from public.perfis p
   where p.status = 'aprovado'
     and p.admin_global = false
  on conflict (tenant_id, perfil_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_replicar_membros_novo_tenant on public.tenants;
create trigger trg_replicar_membros_novo_tenant
  after insert on public.tenants
  for each row execute function public.apos_tenant_novo_replicar_membros();
