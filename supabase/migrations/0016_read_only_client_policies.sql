-- 0016: signed-in users get read access only.
--
-- The app never writes to these tables from the browser. Every write goes
-- through the server with the service-role key (which skips RLS), and the
-- browser client is only used for sign-in. But these policies were `for all`,
-- so anyone signed in could call the REST API with the public anon key and
-- their own session and write rows directly. For example:
--   * a pending owner could set their own account_members.status to 'active'
--     and skip the beta gate
--   * a user could point one of their signature_requests at another account's
--     document and get that document stamped as signed
-- Keep the same row filters, but for select only. With no insert/update/delete
-- policy, RLS denies those writes.

drop policy if exists "member self/own" on account_members;
create policy "member self/own" on account_members for select
  using (id = (select auth.uid()) or account_id = (select auth.uid()));

drop policy if exists "account clients" on clients;
create policy "account clients" on clients for select
  using (account_id in (select account_id from account_members where id = (select auth.uid())));

drop policy if exists "account documents" on documents;
create policy "account documents" on documents for select
  using (account_id in (select account_id from account_members where id = (select auth.uid())));

drop policy if exists "account profile" on profiles;
create policy "account profile" on profiles for select
  using (id in (select account_id from account_members where id = (select auth.uid())));

drop policy if exists "account form_templates" on form_templates;
create policy "account form_templates" on form_templates for select
  using (account_id in (select account_id from account_members where id = (select auth.uid())));

drop policy if exists "account activity" on activity;
create policy "account activity" on activity for select
  using (account_id in (select account_id from account_members where id = (select auth.uid())));

drop policy if exists "account signature_requests" on signature_requests;
create policy "account signature_requests" on signature_requests for select
  using (account_id in (select account_id from account_members where id = (select auth.uid())));
