-- Fase 5.1 — Aprovação de usuários
--
-- Adiciona status de aprovação em `perfis` + ajusta o trigger
-- `handle_new_user` pra bloquear signup fora do domínio institucional
-- @maisaedu.com.br e deixar novos users como 'pendente'.

create type public.status_usuario as enum ('pendente', 'aprovado', 'rejeitado');

alter table public.perfis
  add column status           public.status_usuario not null default 'pendente',
  add column aprovado_em      timestamptz,
  add column aprovado_por     uuid references public.perfis(id),
  add column motivo_rejeicao  text;

-- Bootstrap admins ficam pré-aprovados
update public.perfis
   set status = 'aprovado', aprovado_em = now()
 where admin_global = true;

-- Users que já existiam antes desta migration ficam aprovados (retroativo),
-- pra não trancar quem já tem acesso. Novos signups virão como pendente.
update public.perfis
   set status = 'aprovado', aprovado_em = now()
 where status = 'pendente';

-- Novo trigger: restringe cadastro a @maisaedu.com.br, cria perfil pendente.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  eh_bootstrap boolean;
begin
  if right(new.email, length('@maisaedu.com.br')) <> '@maisaedu.com.br' then
    raise exception 'Cadastro restrito a e-mails @maisaedu.com.br';
  end if;

  eh_bootstrap := exists (select 1 from public.bootstrap_admins where email = new.email);

  insert into public.perfis (id, nome, email, admin_global, status, aprovado_em)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', new.email),
    new.email,
    eh_bootstrap,
    case when eh_bootstrap then 'aprovado'::public.status_usuario else 'pendente'::public.status_usuario end,
    case when eh_bootstrap then now() else null end
  );

  -- Aceita convites pendentes (fluxo externo, hoje sem uso ativo)
  insert into public.membros (tenant_id, perfil_id, papel)
  select c.tenant_id, new.id, c.papel
    from public.convites c
   where c.email = new.email and c.aceito_em is null;

  update public.convites
     set aceito_em = now()
   where email = new.email and aceito_em is null;

  return new;
end;
$$;

drop policy if exists perfis_update_proprio on public.perfis;
create policy perfis_update_admin_or_own_metadata on public.perfis
  for update using (id = auth.uid() or public.eh_admin_global());
