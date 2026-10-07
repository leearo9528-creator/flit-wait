alter table booths add column if not exists image_url text;
alter table booths add column if not exists description text;
alter table events add column if not exists image_url text;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('images', 'images', true, 5242880, array['image/jpeg','image/png','image/webp']) on conflict (id) do nothing;
create policy "images public read" on storage.objects for select using (bucket_id = 'images');
create policy "images admin write" on storage.objects for insert to authenticated with check (bucket_id = 'images' and is_admin());
create policy "images admin update" on storage.objects for update to authenticated using (bucket_id = 'images' and is_admin());
create policy "images admin delete" on storage.objects for delete to authenticated using (bucket_id = 'images' and is_admin());
-- event_summary / booth_summary 에 image_url, description, avg_service_min 추가 (본문은 Supabase 에 적용된 버전 참조)
