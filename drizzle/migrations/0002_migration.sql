
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, email, full_name) values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  if lower(new.email) = 'gradimokuba1@gmail.com' then
    insert into public.user_roles(user_id, role) values (new.id,'dg'),(new.id,'financier') on conflict do nothing;
  end if;
  return new;
end $$;
