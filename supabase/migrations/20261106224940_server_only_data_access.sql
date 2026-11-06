-- The browser uses Supabase only for Auth. All application data access goes
-- through server-side account checks and service_role. Direct browser access
-- must not bypass approval, owner-only operations, or document locking.
begin;
do $$
declare
  table_name text;
  pol record;
begin
  foreach table_name in array array[
    'profiles', 'account_members', 'clients', 'documents', 'form_templates',
    'activity', 'signature_requests', 'subscriptions', 'call_usage',
    'sms_sessions', 'stripe_events'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all privileges on table public.%I from public, anon, authenticated', table_name);
    -- No permissive policies remain as a trap for a later accidental grant.
    for pol in select policyname from pg_policies
      where schemaname = 'public' and tablename = table_name
    loop
      execute format('drop policy %I on public.%I', pol.policyname, table_name);
    end loop;
  end loop;
end;
$$;

-- Sensitive documents must never be accessible via public storage URLs.
update storage.buckets set public = false where id = 'form-templates';
-- RESTRICTIVE policies also block any permissive policy added elsewhere.
drop policy if exists "pheme private documents server only" on storage.objects;
create policy "pheme private documents server only" on storage.objects
  as restrictive for all to anon, authenticated
  using (bucket_id <> 'form-templates')
  with check (bucket_id <> 'form-templates');
commit;
