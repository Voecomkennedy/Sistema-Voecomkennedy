-- Storage/Auth sintéticos em cluster descartável. Não representa HTTP ou uploads reais Supabase.
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
grant usage on schema storage to anon,authenticated,service_role;
grant select on storage.objects to authenticated;
grant all on storage.objects,storage.buckets to service_role;
