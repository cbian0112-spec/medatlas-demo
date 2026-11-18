# MedAtlas Supabase CMS setup

This backend is a CMS foundation for the MedAtlas demo. The existing static frontend is not connected to it by this change.

## Files

- `supabase/config.toml`: local project identifier and explicit JWT verification for the function.
- `supabase/migrations/202503080001_cms_foundation.sql`: schema, workflow enums, RLS, grants, audit and storage policies, triggers, and product seed data.
- `supabase/functions/invite-user/index.ts`: admin-only staff invitation Edge Function.

The migration creates:

- `profiles` keyed canonically by `user_id`, with `admin`, `editor`, and `reviewer` roles plus `is_active`.
- `products`, whose public visibility is controlled only by `is_active`.
- `research_updates` and `resources` with `draft`, `review`, `published`, and `archived` states.
- `documents` metadata with exactly one product, resource, or research parent. Documents have no stored status and inherit visibility from that parent.
- Append-only-from-the-client `audit_logs`, populated by database triggers.
- The public `medical-documents` Storage bucket.
- Nine active product records with the codes and theme colors used by the frontend.

## Prerequisites

1. Create a Supabase project for the intended environment.
2. Install and authenticate the Supabase CLI.
3. Record the project reference, project URL, anon/publishable key, and the exact deployed website origin, such as `https://example.com`. An origin has scheme, host, and optional port, with no path and preferably no trailing slash.
4. Keep production and demo projects separate. Never copy real medical content into the public demo project.

## Apply the database migration

Link the local directory and apply the standard forward-only migration:

```powershell
supabase login
supabase link --project-ref <project-ref>
supabase db push
```

For a new local Supabase stack, `supabase db reset` applies all migrations from an empty database. Do not rerun the migration file manually against a database where it is already recorded. Add a new timestamped migration for every later change.

Before applying to any shared environment, inspect the generated plan/diff and take a database backup. Test the migration in a disposable or staging project first.

## Initialize the first administrator

The invitation function requires an existing active administrator. Bootstrap exactly one administrator through the Supabase Dashboard and SQL Editor:

1. In **Authentication > Users**, create the administrator user with their corporate email. Require the normal email/password setup or approved SSO flow. Do not share a temporary password.
2. Copy that user's UUID.
3. Run this once in the SQL Editor, replacing both values:

```sql
insert into public.profiles (user_id, email, display_name, role, is_active)
values (
  '<auth-user-uuid>'::uuid,
  'admin@example.com',
  'Initial administrator',
  'admin',
  true
)
on conflict (user_id) do update
set email = excluded.email,
    display_name = excluded.display_name,
    role = 'admin',
    is_active = true;
```

Confirm that the UUID belongs to the same email in `auth.users`. After bootstrap, use `invite-user` rather than manually creating staff. Keep at least two controlled administrator accounts for recovery, and deactivate departed staff by setting `profiles.is_active = false`; do not rely only on UI access controls.

## Configure and deploy `invite-user`

Supabase injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` into hosted Edge Functions. The function reads these at runtime. The service-role key is not stored in this repository and must never be exposed to frontend code, logs, browser environment variables, or a public secret store.

Set the allowed browser origin and optional post-invitation redirect:

```powershell
supabase secrets set ALLOWED_SITE_ORIGIN=https://example.com
supabase secrets set INVITE_REDIRECT_URL=https://example.com/accept-invite
supabase functions deploy invite-user
```

Add `INVITE_REDIRECT_URL` to the project's **Authentication > URL Configuration > Redirect URLs** allowlist. Keep the default JWT verification enabled. Do not deploy with `--no-verify-jwt`. The function also validates the bearer token with `auth.getUser()` and confirms that the caller has an active `admin` profile before creating a user with the service-role client.

The endpoint accepts only `POST` and an exact `Origin` match:

```json
{
  "email": "editor@example.com",
  "role": "editor",
  "display_name": "Example Editor"
}
```

Allowed roles are `admin`, `editor`, and `reviewer`. Calls from scripts must also send the configured `Origin` header. CORS is a browser control, not an authorization mechanism; the JWT and active-admin check enforce authorization.

If auth invitation succeeds but profile creation fails, the function attempts to delete the invited auth user. A failed cleanup is logged in Edge Function logs and must be reconciled by an administrator.

`profiles.user_id` is the canonical profile key used by `admin/admin.js`, the invitation Edge Function, and all business-table foreign keys.

## Authorization model

RLS is enabled on every application table. The migration revokes table privileges from `anon` and `authenticated` before granting only required operations.

- Anonymous users can select active products, published research updates and resources under active products, and document metadata whose one associated parent is public.
- Authenticated users without an active staff profile receive only the same public read view.
- Active editors can create and update only non-public content: inactive products, non-published research/resources, and document metadata whose parent is not public. Editors cannot activate a product, edit an active product, edit a published research/resource row, or edit document metadata whose parent is public.
- Active reviewers and administrators can activate products, create/edit/publish research and resources, and manage document metadata regardless of inherited visibility.
- Only active administrators can delete business records or manage profiles. Users cannot update their own profile or role through the API.
- Only active administrators can read audit logs. Client roles cannot insert, update, or delete audit records.

`public.has_active_role()` is a `SECURITY DEFINER` helper with an empty fixed `search_path` and fully qualified references. Profile policies call this helper instead of querying `profiles` directly, which prevents recursive profile RLS evaluation. Do not change it to invoker security, grant it to `anon`, enable `FORCE ROW LEVEL SECURITY` on `profiles`, or add self-service profile updates without a separate privilege-escalation review.

RLS is not applied to the service role. Any server component that holds the service-role key can bypass these policies, so restrict that key to trusted server runtimes and keep function code narrowly scoped.

## Storage behavior and the Demo boundary

`medical-documents` is a **private** bucket. Bucket settings cap objects at 50 MiB and allow only these declared MIME types:

- PDF (`.pdf`)
- PowerPoint (`.ppt`, `.pptx`)
- Word (`.doc`, `.docx`)

The object policy also checks the filename extension. MIME and extension checks reduce accidental uploads but do not prove a file is safe or correctly labeled. Add malware scanning, content disarm/reconstruction where required, and server-side file-signature inspection before accepting regulated or externally supplied documents.

Storage access follows the document metadata and its parent content:

- Anonymous visitors can request a one-hour signed URL only for a document linked to an active product or published resource/research update.
- Active staff can request signed URLs for content visible in the CMS.
- Uploaded object paths must begin with the uploader's authenticated user ID.
- Only administrators can delete an object after document metadata exists.
- An uploader can delete their own orphaned object only when metadata insertion failed.

Signed URLs are temporary bearer URLs. Do not share them outside the intended audience. The Office Online Viewer receives the signed URL so Microsoft can retrieve the file during the preview window. For production or internal medical content, confirm this data flow with security and privacy owners or replace it with company-managed SharePoint/Graph or server-side PDF conversion.

## Publication and data consistency notes

Editors cannot update a row while its status is `published`, including changing it back to a non-published state. A reviewer or administrator must withdraw or archive published content.

`published_at` is stored on research and resource records but is not automatically set or cleared when status changes. The publishing client sets it deliberately. Prefer an RPC when publication must update multiple records atomically.

`products` and `documents` do not store content-status columns. Product visibility maps directly from `is_active`. A document follows its parent: an active product is public directly, while a linked resource or research update must be `published` and belong to an active product.

Storage object creation and database insertion are separate operations. The application must compensate for partial failures, such as deleting an uploaded object when metadata insertion fails. Use a unique, server-generated path and create the database row only after upload succeeds.

## Production migration checklist

Before treating this foundation as a production medical-information system:

1. Confirm product slugs and metadata with the content owner. Seed names are the only supplied authoritative fields.
2. Review the private-bucket signed URL lifetime and Office Online Viewer data flow for company policy.
3. Define reviewer separation-of-duties, withdrawal, archival, legal hold, retention, and deletion rules. Current deletes are hard deletes and audit rows contain JSON snapshots, but Storage deletion is separate.
4. Add controlled vocabularies for `resource_type`, medical metadata, locales, indications, source provenance, approval IDs, and expiry/review dates.
5. Add file scanning and verify file signatures rather than trusting browser-supplied MIME types.
6. Add integration tests using anon, unaffiliated authenticated, inactive, editor, reviewer, admin, and service-role clients. Test every status transition and parent-child visibility rule.
7. Review indexes against real query plans and expected data volume.
8. Configure backups, point-in-time recovery, log retention, alerting, secret rotation, SSO/MFA, and environment-specific redirect allowlists.
9. Validate privacy, regulatory, medical/legal review, and data-residency requirements with the responsible teams.
10. Rehearse rollback using a backup. Do not edit a migration that has already run in a shared environment; create a corrective migration.
