const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');

test('database lockdown blocks membership escalation and direct document access', async () => {
  const db = new PGlite();
  const tables = ['profiles', 'account_members', 'clients', 'documents', 'form_templates',
    'activity', 'signature_requests', 'subscriptions', 'call_usage', 'sms_sessions', 'stripe_events'];
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
      CREATE SCHEMA storage;
      GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
      CREATE TABLE storage.buckets (id text primary key, public boolean);
      INSERT INTO storage.buckets VALUES ('form-templates', true);
      CREATE TABLE storage.objects (id integer, bucket_id text);
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT ALL ON storage.objects TO anon, authenticated, service_role;
      CREATE POLICY permissive_storage ON storage.objects FOR ALL USING (true) WITH CHECK (true);
      INSERT INTO storage.objects VALUES (1, 'form-templates'), (2, 'other');`);
    for (const table of tables) {
      await db.exec(`CREATE TABLE public.${table} (id integer primary key, status text);
        INSERT INTO public.${table} VALUES (1, 'pending');
        ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;
        GRANT ALL ON public.${table} TO anon, authenticated, service_role;
        CREATE POLICY old_access ON public.${table} FOR ALL USING (true) WITH CHECK (true);`);
    }
    // Reproduce the pre-fix capability: a user could activate their membership.
    await db.exec(`SET ROLE authenticated; UPDATE account_members SET status='active' WHERE id=1; RESET ROLE;`);
    await db.exec(readFileSync('supabase/migrations/20261106224940_server_only_data_access.sql', 'utf8'));
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      for (const table of tables) {
        await assert.rejects(db.query(`SELECT * FROM ${table}`), /permission denied/);
        await assert.rejects(db.query(`UPDATE ${table} SET status='active' WHERE id=1`), /permission denied/);
        await assert.rejects(db.query(`INSERT INTO ${table} VALUES (2, 'active')`), /permission denied/);
      }
      assert.deepEqual((await db.query('SELECT id FROM storage.objects')).rows, [{id:2}]);
      await assert.rejects(db.query("INSERT INTO storage.objects VALUES (3, 'form-templates')"), /row-level security/);
      await db.exec('RESET ROLE');
    }
    assert.equal((await db.query("SELECT public FROM storage.buckets WHERE id='form-templates'")).rows[0].public, false);
    // An accidental future grant is still denied by RLS with no permissive policies.
    await db.exec('GRANT SELECT ON documents TO authenticated; SET ROLE authenticated;');
    assert.equal((await db.query('SELECT * FROM documents')).rows.length, 0);
    await db.exec('RESET ROLE; SET ROLE service_role;');
    assert.equal((await db.query('SELECT * FROM documents')).rows.length, 1);
    await db.exec("UPDATE account_members SET status='active' WHERE id=1");
  } finally { await db.close(); }
});
