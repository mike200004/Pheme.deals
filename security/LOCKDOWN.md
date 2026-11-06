# Pheme security hardening — database applied, application not deployed

Reviewed against the Pheme.deals repository on November 6, 2026. This is an initial hardening change, not a certification or a completed production security audit.

## Changes

- Public account creation is closed, including direct calls to the old server action. Existing authenticated owner-to-assistant invitations remain available. New owner accounts require administrative provisioning of both the Auth user and its profile/membership; inviting an Auth user alone is insufficient.
- Data migration removes direct anon/authenticated access and permissive policies from eleven application tables. The existing browser uses Supabase only for Auth; server data operations continue using service_role. This prevents direct membership self-activation and bypasses of document locks and owner-only operations. Application-level tenant filtering is still essential because service_role bypasses RLS.
- The document bucket becomes private, with a restrictive policy blocking direct browser access to its objects even when another permissive policy exists.
- Share links expire after 24 hours; signature links after seven days. Tokens are purpose-bound and require a dedicated secret. All old document links become invalid after deployment and must be reissued.
- Phone/SMS assistants and administrative maintenance endpoints are disabled by default. Caller ID alone must not authorize access to sensitive documents. Provider webhook authentication remains in place if these features are explicitly enabled.
- Chat input validates roles, message counts and lengths; upstream errors are no longer returned verbatim to the browser.
- Server-only build protection guards the privileged Supabase client. Additional browser headers restrict framing, object embedding, form destinations and referrer leakage. This is a baseline CSP, not a full nonce-based script policy.
- Next.js updated to 15.5.29; runtime dependencies pinned; PostCSS overridden to 8.5.32 to resolve the remaining advisory without a framework major upgrade.

## Validation

- `npm run test:security`: four test cases pass, including PostgreSQL role/privilege and storage-policy behavior in a disposable PGlite database.
- Tests reproduce pre-fix membership modification, then confirm anon/authenticated reads, inserts and updates are denied after migration. Service-role access remains functional. This fixture does not validate production schema drift or hosted Supabase configuration.
- Token tests cover expiry, tampering, cross-purpose reuse, legacy rejection and missing secrets. Other tests cover direct public signup calls and forged chat roles.
- `npm run build`: passed including TypeScript checks and the repository's UI/tool consistency checks.
- Dependency scan: zero known vulnerabilities at validation time. This does not establish that the application is vulnerability-free.

## Live work completed on November 6, 2026

- Confirmed project `gflkkgzwvghgsbkkzfgs` in FreeProjects matches the repository's Supabase configuration.
- Live permissions differed from repository migrations: an earlier `revoke_write_grants` change already prevented membership self-activation. The suspected write bypass in the repository was not present in production.
- Applied the server-only data restriction through the Supabase SQL Editor. Verification returned zero browser grants, zero public-schema policies, RLS enabled on all application tables, and server access preserved.
- Applied the private storage restriction in the same successful transaction. The bucket was already private before this change.
- Turned off “Allow new users to sign up” and saved. Anonymous sign-in and manual identity linking were already off; email confirmation was already on.
- No application deployment or credential changes were performed. This SQL Editor change did not create a Supabase migration-history entry.

## Remaining release steps

1. In Vercel, open the existing project serving pheme.deals. Under Settings → Environment Variables, set a dedicated random `SHARE_SECRET` of at least 32 bytes. A password manager can generate this; do not use your database key. Set `ENABLE_PHONE_ASSISTANT=false` and `ENABLE_ADMIN_MAINTENANCE=false`. Configure the intended deployment environments before releasing.
2. Review and merge the `security/invitation-only-hardening` branch into the production branch, then deploy in Vercel. Confirm the Git integration points to `mike200004/Pheme.deals`. A branch push is not a verified production deployment.
3. Reconcile migration history before the next CLI migration push. The matching SQL file is safe to rerun, but older live migrations also differ from repository history. Do not blindly replay all old migrations.
4. Test sign-in, recovery, an existing owner's team invitation and invite acceptance, client/document isolation, PDF rendering and signing. Check that /signup is invitation-only and disabled phone/admin endpoints reject requests. Old share/sign links stop working; generate new ones.
5. In Supabase, check Authentication → URL Configuration for exact production and approved preview URLs; remove unused redirects. Review password protections, authentication rate limits and Security Advisors. Verify actual anon/authenticated API calls cannot read application data.
6. Implement and test mandatory application MFA, including enrollment and recovery, before claiming a completed lockdown. Merely enabling TOTP in the Supabase dashboard does not enforce MFA in the app. Enable MFA for your GitHub, Vercel and Supabase administrator accounts too.

## Further work needed for a stronger security posture

- Mandatory MFA for application users and organization administrators, with enrollment, recovery and server-side assurance enforcement. The current code does not enforce MFA.
- Durable distributed rate limits and abuse controls; the existing in-memory limiter is not a global guarantee across serverless instances.
- Replace broad service-role data access with least-privilege, tenant-scoped access where practical; test isolation for every server action and assistant tool.
- Independently verified caller authentication before restoring phone/SMS assistants.
- Per-link revocation and stronger recipient verification for sensitive documents; expiring links remain bearer credentials.
- Full script CSP, dependency/secret scanning in CI, repository protections, backup/restore validation, incident logging and alerts.
- Confirm production secrets and exposure history and rotate any credentials actually found exposed. No claim of exposed secrets or compromise has been established here.

References: [Supabase Auth settings](https://supabase.com/docs/guides/auth/general-configuration), [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security).
