
create policy "staff read justificatifs" on storage.objects for select to authenticated
  using (bucket_id='justificatifs' and public.is_staff(auth.uid()));
create policy "staff upload justificatifs" on storage.objects for insert to authenticated
  with check (bucket_id='justificatifs' and public.is_staff(auth.uid())
    and lower(storage.extension(name)) in ('jpg','jpeg','png','webp','pdf','heic'));
