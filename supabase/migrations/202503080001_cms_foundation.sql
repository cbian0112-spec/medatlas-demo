-- MedAtlas CMS foundation.
-- This migration targets a new Supabase project and matches the field contract
-- used by admin/admin.js and cms-client.js.

create extension if not exists pgcrypto with schema extensions;

create type public.app_role as enum ('admin', 'editor', 'reviewer');
create type public.content_status as enum ('draft', 'review', 'published', 'archived');

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  role public.app_role not null default 'editor',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_not_blank check (btrim(email) <> '')
);

create unique index profiles_email_lower_key on public.profiles (lower(email));

create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  code text not null unique,
  name text not null unique,
  description text,
  accent text not null,
  accent_rgb text not null,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint products_code_not_blank check (btrim(code) <> ''),
  constraint products_name_not_blank check (btrim(name) <> ''),
  constraint products_accent_format check (accent ~ '^#[0-9A-Fa-f]{6}$'),
  constraint products_accent_rgb_format check (
    accent_rgb ~ '^(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9]),(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9]),(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])$'
  )
);

create index products_display_order_idx on public.products (display_order, created_at);

create table public.research_updates (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete restrict,
  title text not null,
  summary text not null,
  category text not null,
  status public.content_status not null default 'draft',
  event_date date not null,
  is_featured boolean not null default false,
  source_name text,
  source_url text,
  published_at timestamptz,
  created_by uuid references public.profiles (user_id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles (user_id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint research_updates_title_not_blank check (btrim(title) <> ''),
  constraint research_updates_summary_not_blank check (btrim(summary) <> ''),
  constraint research_updates_category_not_blank check (btrim(category) <> ''),
  constraint research_updates_source_url_http check (
    source_url is null or source_url ~* '^https?://'
  )
);

create index research_updates_product_status_idx
  on public.research_updates (product_id, status, event_date desc, updated_at desc);

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete restrict,
  title text not null,
  summary text,
  resource_type text not null,
  status public.content_status not null default 'draft',
  source_name text,
  source_url text,
  year integer,
  display_order integer not null default 0,
  published_at timestamptz,
  created_by uuid references public.profiles (user_id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles (user_id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resources_title_not_blank check (btrim(title) <> ''),
  constraint resources_type_not_blank check (btrim(resource_type) <> ''),
  constraint resources_year_range check (year is null or year between 1900 and 2200),
  constraint resources_source_url_http check (
    source_url is null or source_url ~* '^https?://'
  )
);

create index resources_product_status_idx
  on public.resources (product_id, status, display_order, updated_at desc);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products (id) on delete restrict,
  resource_id uuid references public.resources (id) on delete restrict,
  research_update_id uuid references public.research_updates (id) on delete restrict,
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null,
  file_size bigint not null,
  version_label text,
  uploaded_by uuid references public.profiles (user_id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint documents_exactly_one_parent check (
    num_nonnulls(product_id, resource_id, research_update_id) = 1
  ),
  constraint documents_file_name_not_blank check (btrim(file_name) <> ''),
  constraint documents_storage_path_not_blank check (btrim(storage_path) <> ''),
  constraint documents_size_limit check (file_size > 0 and file_size <= 52428800),
  constraint documents_allowed_mime check (
    mime_type in (
      'application/pdf',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
  )
);

create index documents_product_idx on public.documents (product_id, created_at desc);
create index documents_resource_idx on public.documents (resource_id, created_at desc);
create index documents_research_update_idx on public.documents (research_update_id, created_at desc);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id uuid,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  actor_id uuid references auth.users (id) on delete set null,
  old_data jsonb,
  new_data jsonb,
  occurred_at timestamptz not null default now()
);

create index audit_logs_record_idx on public.audit_logs (table_name, record_id, occurred_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, occurred_at desc);

-- SECURITY DEFINER avoids recursive profiles RLS evaluation. The empty fixed
-- search_path and qualified references prevent object shadowing.
create function public.has_active_role(allowed_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as p
    where p.user_id = auth.uid()
      and p.is_active
      and p.role = any (allowed_roles)
  );
$$;

-- A document is public only through its one associated parent.
create function public.document_parent_is_public(
  target_product_id uuid,
  target_resource_id uuid,
  target_research_update_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when target_product_id is not null then exists (
      select 1
      from public.products as p
      where p.id = target_product_id and p.is_active
    )
    when target_resource_id is not null then exists (
      select 1
      from public.resources as r
      join public.products as p on p.id = r.product_id
      where r.id = target_resource_id
        and r.status = 'published'
        and p.is_active
    )
    when target_research_update_id is not null then exists (
      select 1
      from public.research_updates as ru
      join public.products as p on p.id = ru.product_id
      where ru.id = target_research_update_id
        and ru.status = 'published'
        and p.is_active
    )
    else false
  end;
$$;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_id uuid;
begin
  if tg_op = 'DELETE' then
    row_id := old.id;
  else
    row_id := new.id;
  end if;

  insert into public.audit_logs (table_name, record_id, action, actor_id, old_data, new_data)
  values (
    tg_table_name,
    row_id,
    tg_op,
    auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.has_active_role(public.app_role[]) from public, anon, authenticated;
revoke all on function public.document_parent_is_public(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.write_audit_log() from public, anon, authenticated;

grant execute on function public.has_active_role(public.app_role[]) to authenticated;
grant execute on function public.document_parent_is_public(uuid, uuid, uuid) to anon, authenticated;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger products_set_updated_at before update on public.products
for each row execute function public.set_updated_at();
create trigger research_updates_set_updated_at before update on public.research_updates
for each row execute function public.set_updated_at();
create trigger resources_set_updated_at before update on public.resources
for each row execute function public.set_updated_at();

create trigger profiles_audit after insert or update or delete on public.profiles
for each row execute function public.write_audit_log();
create trigger products_audit after insert or update or delete on public.products
for each row execute function public.write_audit_log();
create trigger research_updates_audit after insert or update or delete on public.research_updates
for each row execute function public.write_audit_log();
create trigger resources_audit after insert or update or delete on public.resources
for each row execute function public.write_audit_log();
create trigger documents_audit after insert or update or delete on public.documents
for each row execute function public.write_audit_log();

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.research_updates enable row level security;
alter table public.resources enable row level security;
alter table public.documents enable row level security;
alter table public.audit_logs enable row level security;

-- Remove implicit API access, then grant only operations covered by RLS.
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.products from anon, authenticated;
revoke all on table public.research_updates from anon, authenticated;
revoke all on table public.resources from anon, authenticated;
revoke all on table public.documents from anon, authenticated;
revoke all on table public.audit_logs from anon, authenticated;
revoke all on sequence public.audit_logs_id_seq from anon, authenticated;

grant select on table public.products, public.research_updates, public.resources, public.documents to anon;
grant select on table public.profiles, public.products, public.research_updates, public.resources, public.documents to authenticated;
grant insert, update, delete on table public.profiles, public.products, public.research_updates, public.resources, public.documents to authenticated;
grant select on table public.audit_logs to authenticated;

-- Profiles: members read their own row; active admins manage all rows.
create policy profiles_select_own
on public.profiles for select to authenticated
using (user_id = auth.uid());

create policy profiles_admin_select
on public.profiles for select to authenticated
using (public.has_active_role(array['admin']::public.app_role[]));

create policy profiles_admin_insert
on public.profiles for insert to authenticated
with check (public.has_active_role(array['admin']::public.app_role[]));

create policy profiles_admin_update
on public.profiles for update to authenticated
using (public.has_active_role(array['admin']::public.app_role[]))
with check (public.has_active_role(array['admin']::public.app_role[]));

create policy profiles_admin_delete
on public.profiles for delete to authenticated
using (public.has_active_role(array['admin']::public.app_role[]));

-- Products have no publication status. is_active alone controls public reads.
create policy products_public_select
on public.products for select to anon, authenticated
using (is_active);

create policy products_staff_select
on public.products for select to authenticated
using (public.has_active_role(array['admin', 'editor', 'reviewer']::public.app_role[]));

create policy products_editor_insert
on public.products for insert to authenticated
with check (
  public.has_active_role(array['editor']::public.app_role[])
  and not is_active
);

create policy products_publisher_insert
on public.products for insert to authenticated
with check (public.has_active_role(array['admin', 'reviewer']::public.app_role[]));

create policy products_editor_update
on public.products for update to authenticated
using (
  public.has_active_role(array['editor']::public.app_role[])
  and not is_active
)
with check (
  public.has_active_role(array['editor']::public.app_role[])
  and not is_active
);

create policy products_publisher_update
on public.products for update to authenticated
using (public.has_active_role(array['admin', 'reviewer']::public.app_role[]))
with check (public.has_active_role(array['admin', 'reviewer']::public.app_role[]));

create policy products_admin_delete
on public.products for delete to authenticated
using (public.has_active_role(array['admin']::public.app_role[]));

-- Editors can work only on records that are and remain non-published.
create policy research_updates_public_select
on public.research_updates for select to anon, authenticated
using (
  status = 'published'
  and exists (
    select 1 from public.products as p
    where p.id = research_updates.product_id and p.is_active
  )
);

create policy research_updates_staff_select
on public.research_updates for select to authenticated
using (public.has_active_role(array['admin', 'editor', 'reviewer']::public.app_role[]));

create policy research_updates_editor_insert
on public.research_updates for insert to authenticated
with check (
  public.has_active_role(array['editor']::public.app_role[])
  and status <> 'published'
);

create policy research_updates_publisher_insert
on public.research_updates for insert to authenticated
with check (public.has_active_role(array['admin', 'reviewer']::public.app_role[]));

create policy research_updates_editor_update
on public.research_updates for update to authenticated
using (
  public.has_active_role(array['editor']::public.app_role[])
  and status <> 'published'
)
with check (
  public.has_active_role(array['editor']::public.app_role[])
  and status <> 'published'
);

create policy research_updates_publisher_update
on public.research_updates for update to authenticated
using (public.has_active_role(array['admin', 'reviewer']::public.app_role[]))
with check (public.has_active_role(array['admin', 'reviewer']::public.app_role[]));

create policy research_updates_admin_delete
on public.research_updates for delete to authenticated
using (public.has_active_role(array['admin']::public.app_role[]));

create policy resources_public_select
on public.resources for select to anon, authenticated
using (
  status = 'published'
  and exists (
    select 1 from public.products as p
    where p.id = resources.product_id and p.is_active
  )
);

create policy resources_staff_select
on public.resources for select to authenticated
using (public.has_active_role(array['admin', 'editor', 'reviewer']::public.app_role[]));

create policy resources_editor_insert
on public.resources for insert to authenticated
with check (
  public.has_active_role(array['editor']::public.app_role[])
  and status <> 'published'
);

create policy resources_publisher_insert
on public.resources for insert to authenticated
with check (public.has_active_role(array['admin', 'reviewer']::public.app_role[]));

create policy resources_editor_update
on public.resources for update to authenticated
using (
  public.has_active_role(array['editor']::public.app_role[])
  and status <> 'published'
)
with check (
  public.has_active_role(array['editor']::public.app_role[])
  and status <> 'published'
);

create policy resources_publisher_update
on public.resources for update to authenticated
using (public.has_active_role(array['admin', 'reviewer']::public.app_role[]))
with check (public.has_active_role(array['admin', 'reviewer']::public.app_role[]));

create policy resources_admin_delete
on public.resources for delete to authenticated
using (public.has_active_role(array['admin']::public.app_role[]));

-- Documents inherit visibility from exactly one parent and store no status.
create policy documents_public_select
on public.documents for select to anon, authenticated
using (
  public.document_parent_is_public(product_id, resource_id, research_update_id)
);

create policy documents_staff_select
on public.documents for select to authenticated
using (public.has_active_role(array['admin', 'editor', 'reviewer']::public.app_role[]));

create policy documents_editor_insert
on public.documents for insert to authenticated
with check (
  public.has_active_role(array['editor']::public.app_role[])
  and not public.document_parent_is_public(product_id, resource_id, research_update_id)
);

create policy documents_publisher_insert
on public.documents for insert to authenticated
with check (public.has_active_role(array['admin', 'reviewer']::public.app_role[]));

create policy documents_editor_update
on public.documents for update to authenticated
using (
  public.has_active_role(array['editor']::public.app_role[])
  and not public.document_parent_is_public(product_id, resource_id, research_update_id)
)
with check (
  public.has_active_role(array['editor']::public.app_role[])
  and not public.document_parent_is_public(product_id, resource_id, research_update_id)
);

create policy documents_publisher_update
on public.documents for update to authenticated
using (public.has_active_role(array['admin', 'reviewer']::public.app_role[]))
with check (public.has_active_role(array['admin', 'reviewer']::public.app_role[]));

create policy documents_admin_delete
on public.documents for delete to authenticated
using (public.has_active_role(array['admin']::public.app_role[]));

create policy audit_logs_admin_select
on public.audit_logs for select to authenticated
using (public.has_active_role(array['admin']::public.app_role[]));

-- Private document storage. Public visitors receive time-limited signed URLs
-- only when the document metadata and its parent are publicly readable.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'medical-documents',
  'medical-documents',
  false,
  52428800,
  array[
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy medical_documents_published_read
on storage.objects for select to anon, authenticated
using (
  bucket_id = 'medical-documents'
  and exists (
    select 1
    from public.documents as d
    where d.storage_path = name
      and public.document_parent_is_public(d.product_id, d.resource_id, d.research_update_id)
  )
);

create policy medical_documents_staff_read
on storage.objects for select to authenticated
using (
  bucket_id = 'medical-documents'
  and public.has_active_role(array['admin', 'editor', 'reviewer']::public.app_role[])
);

create policy medical_documents_staff_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'medical-documents'
  and public.has_active_role(array['admin', 'editor', 'reviewer']::public.app_role[])
  and (storage.foldername(name))[1] = auth.uid()::text
  and lower(storage.extension(name)) in ('pdf', 'ppt', 'pptx', 'doc', 'docx')
);

-- Upload is followed by metadata insertion. A staff member may remove only
-- their own orphaned object when that insertion fails.
create policy medical_documents_uploader_cleanup_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'medical-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
  and not exists (
    select 1 from public.documents as d where d.storage_path = name
  )
);

create policy medical_documents_admin_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'medical-documents'
  and public.has_active_role(array['admin']::public.app_role[])
);

-- Initial active product catalogue. Codes and colors match app.js.
insert into public.products (slug, code, name, accent, accent_rgb, is_active, display_order)
values
  ('baizean',   'BZA', '百泽安', '#66dec5', '102,222,197', true, 10),
  ('baiyueze',  'BYZ', '百悦泽', '#7aa8ff', '122,168,255', true, 20),
  ('baiyueda',  'BYD', '百悦达', '#c8f26b', '200,242,107', true, 30),
  ('baituowei', 'BTW', '百拓维', '#ff9a79', '255,154,121', true, 40),
  ('kaizebai',  'KZB', '凯泽百', '#b69cff', '182,156,255', true, 50),
  ('kailuosi',  'KLS', '凯洛斯', '#64c7f3', '100,199,243', true, 60),
  ('beilituo',  'BLT', '倍利妥', '#ffbd68', '255,189,104', true, 70),
  ('pubeixi',   'PBX', '普贝希', '#72d59b', '114,213,155', true, 80),
  ('baihean',   'BHA', '百赫安', '#f084bd', '240,132,189', true, 90)
on conflict (slug) do update set
  code = excluded.code,
  name = excluded.name,
  accent = excluded.accent,
  accent_rgb = excluded.accent_rgb,
  is_active = excluded.is_active,
  display_order = excluded.display_order;
