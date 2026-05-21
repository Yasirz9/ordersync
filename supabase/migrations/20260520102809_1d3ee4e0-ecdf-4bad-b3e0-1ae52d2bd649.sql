
create or replace function public.claim_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_has_admin boolean;
begin
  if v_uid is null then
    return false;
  end if;
  select exists(select 1 from public.user_roles where role = 'admin') into v_has_admin;
  if v_has_admin then
    return false;
  end if;
  insert into public.user_roles (user_id, role) values (v_uid, 'admin')
    on conflict (user_id, role) do nothing;
  return true;
end;
$$;

revoke execute on function public.claim_admin() from public, anon;
grant execute on function public.claim_admin() to authenticated;
