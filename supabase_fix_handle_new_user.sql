-- ============================================================================
-- Fix: handle_new_user() trigger function fails because it references
-- "user_profiles" unqualified, and the auth-admin role's search_path does
-- not include the public schema -> "relation user_profiles does not exist".
-- Fix: schema-qualify the table and pin search_path explicitly.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.email = 'sales.appletreeinteriors@gmail.com' then
    insert into public.user_profiles (user_id, org_id, name, email, role, initials, is_approved)
    values (new.id, 'appletree-interiors', 'CEO', new.email, 'CEO', 'CE', true)
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$function$;

-- Verify the fix took (should show "set search_path" in the source now)
select pg_get_functiondef(oid) from pg_proc where proname = 'handle_new_user';
