
create type public.app_role as enum ('dg','financier','admin');
create type public.op_type as enum ('recette','depense','transfert','change','ouverture','correction');
create type public.op_status as enum ('brouillon','soumise','approuvee','rejetee','executee','annulee');
create type public.currency_code as enum ('USD','CDF');
create type public.doc_status as enum ('attendu','recu','verifie','rejete','manquant');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text, email text, active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null, unique(user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id=_user_id and role=_role)
$$;
create or replace function public.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles ur join public.profiles p on p.id=ur.user_id
    where ur.user_id=_user_id and ur.role in ('dg','financier','admin') and p.active)
$$;

create policy "own roles" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.is_staff(auth.uid()));
create policy "staff read profiles" on public.profiles for select to authenticated using (id = auth.uid() or public.is_staff(auth.uid()));
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid() and active = true);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, email, full_name) values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Audit
create table public.audit_log (
  id bigserial primary key, user_id uuid, action text not null, object_type text, object_id uuid,
  details jsonb, created_at timestamptz not null default now()
);
grant select on public.audit_log to authenticated;
grant all on public.audit_log to service_role;
alter table public.audit_log enable row level security;
create policy "staff read audit" on public.audit_log for select to authenticated using (public.is_staff(auth.uid()));

create or replace function public.log_audit(_action text, _type text, _id uuid, _details jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into public.audit_log(user_id, action, object_type, object_id, details) values (auth.uid(), _action, _type, _id, _details);
$$;
revoke execute on function public.log_audit(text,text,uuid,jsonb) from public, anon, authenticated;

-- Accounts
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null, account_type text not null check (account_type in ('caisse','banque')),
  currency currency_code not null, institution text, internal_ref text unique,
  opening_balance numeric(18,2), opening_date date, opening_validated boolean not null default false,
  manager_id uuid, active boolean not null default true, notes text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.accounts to authenticated;
grant all on public.accounts to service_role;
alter table public.accounts enable row level security;
create policy "staff read accounts" on public.accounts for select to authenticated using (public.is_staff(auth.uid()));
create policy "fin/admin insert accounts" on public.accounts for insert to authenticated with check (public.has_role(auth.uid(),'financier') or public.has_role(auth.uid(),'admin'));
create policy "fin/admin update accounts" on public.accounts for update to authenticated using (public.has_role(auth.uid(),'financier') or public.has_role(auth.uid(),'admin'));

insert into public.accounts(name, account_type, currency, institution, internal_ref) values
 ('Caisse USD','caisse','USD',null,'CAI-USD'),
 ('Caisse CDF','caisse','CDF',null,'CAI-CDF'),
 ('Equity USD','banque','USD','Equity BCDC','EQT-USD'),
 ('Equity CDF','banque','CDF','Equity BCDC','EQT-CDF');

-- Operations
create sequence public.op_ref_seq;
create table public.operations (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null default ('OP-' || to_char(now(),'YYYYMM') || '-' || lpad(nextval('public.op_ref_seq')::text, 5, '0')),
  op_type op_type not null, status op_status not null default 'brouillon',
  account_id uuid not null references public.accounts(id),
  dest_account_id uuid references public.accounts(id),
  amount numeric(18,2) not null check (amount > 0),
  currency currency_code not null,
  dest_amount numeric(18,2), exchange_rate numeric(18,6), fees numeric(18,2) default 0,
  effective_date date not null default current_date,
  period text not null default to_char(current_date,'YYYY-MM'),
  category text, motif text not null, beneficiary text,
  created_by uuid not null default auth.uid(), created_at timestamptz not null default now(),
  submitted_at timestamptz,
  decided_by uuid, decided_at timestamptz, decision_comment text,
  executed_by uuid, executed_at timestamptz,
  overdraft_override boolean not null default false, override_reason text
);
grant select, insert, update on public.operations to authenticated;
grant all on public.operations to service_role;
alter table public.operations enable row level security;
create policy "staff read ops" on public.operations for select to authenticated using (public.is_staff(auth.uid()));
create policy "fin create draft" on public.operations for insert to authenticated
  with check (public.has_role(auth.uid(),'financier') and status='brouillon' and created_by=auth.uid());
create policy "fin edit own draft" on public.operations for update to authenticated
  using (status='brouillon' and created_by=auth.uid()) with check (status='brouillon' and created_by=auth.uid());

-- Ledger (written only by execute function)
create table public.ledger_entries (
  id bigserial primary key,
  operation_id uuid not null references public.operations(id),
  account_id uuid not null references public.accounts(id),
  amount numeric(18,2) not null,
  created_at timestamptz not null default now(),
  unique(operation_id, account_id)
);
grant select on public.ledger_entries to authenticated;
grant all on public.ledger_entries to service_role;
alter table public.ledger_entries enable row level security;
create policy "staff read ledger" on public.ledger_entries for select to authenticated using (public.is_staff(auth.uid()));

create view public.account_balances with (security_invoker = true) as
select a.id, a.name, a.currency, a.account_type, a.active,
  coalesce(a.opening_balance,0) as opening_balance,
  coalesce(a.opening_balance,0) + coalesce((select sum(l.amount) from public.ledger_entries l where l.account_id=a.id),0) as balance,
  coalesce((select sum(o.amount) from public.operations o where o.account_id=a.id and o.status='approuvee' and o.op_type in ('depense','transfert','change')),0) as committed
from public.accounts a;
grant select on public.account_balances to authenticated;

-- Workflow RPCs
create or replace function public.submit_operation(_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  update operations set status='soumise', submitted_at=now() where id=_id and status='brouillon' and created_by=auth.uid();
  if not found then raise exception 'Opération introuvable ou non modifiable'; end if;
  perform log_audit('soumission','operation',_id);
end $$;

create or replace function public.decide_operation(_id uuid, _approve boolean, _comment text, _override boolean default false, _override_reason text default null)
returns void language plpgsql security definer set search_path=public as $$
declare op operations;
begin
  if not has_role(auth.uid(),'dg') then raise exception 'Seule la DG peut décider'; end if;
  select * into op from operations where id=_id for update;
  if op.status <> 'soumise' then raise exception 'Opération non soumise'; end if;
  if op.created_by = auth.uid() then raise exception 'Vous ne pouvez pas approuver votre propre opération'; end if;
  if not _approve and coalesce(trim(_comment),'')='' then raise exception 'Motif de rejet obligatoire'; end if;
  if _override and coalesce(trim(_override_reason),'')='' then raise exception 'Motif de dérogation obligatoire'; end if;
  update operations set status = case when _approve then 'approuvee'::op_status else 'rejetee'::op_status end,
    decided_by=auth.uid(), decided_at=now(), decision_comment=_comment,
    overdraft_override = _approve and _override, override_reason = case when _approve and _override then _override_reason end
  where id=_id;
  perform log_audit(case when _approve then 'approbation' else 'rejet' end,'operation',_id, jsonb_build_object('comment',_comment,'override',_override,'override_reason',_override_reason));
end $$;

create or replace function public.execute_operation(_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare op operations; bal numeric(18,2); src accounts; dst accounts;
begin
  if not has_role(auth.uid(),'financier') then raise exception 'Seul le responsable financier exécute'; end if;
  select * into op from operations where id=_id for update;
  if op.status <> 'approuvee' then raise exception 'Opération non approuvée'; end if;
  select * into src from accounts where id=op.account_id for update;
  if not src.active then raise exception 'Compte inactif'; end if;
  if src.currency <> op.currency then raise exception 'Devise incohérente avec le compte'; end if;
  if op.op_type in ('depense','transfert','change') then
    select coalesce(src.opening_balance,0) + coalesce(sum(amount),0) into bal from ledger_entries where account_id=src.id;
    if bal < op.amount + coalesce(op.fees,0) then
      raise exception 'Solde insuffisant (disponible: % %). Les fonds doivent être réellement disponibles.', bal, src.currency;
    end if;
  end if;
  if op.op_type in ('transfert','change') then
    select * into dst from accounts where id=op.dest_account_id for update;
    if dst.id is null then raise exception 'Compte destination requis'; end if;
    if op.op_type='transfert' and dst.currency <> src.currency then raise exception 'Transfert entre devises différentes: utilisez une opération de change'; end if;
    if op.op_type='change' and (dst.currency = src.currency or op.dest_amount is null or op.exchange_rate is null) then raise exception 'Change: devise destination, taux et montant destination requis'; end if;
  end if;

  if op.op_type = 'recette' then
    insert into ledger_entries(operation_id, account_id, amount) values (op.id, src.id, op.amount);
  elsif op.op_type = 'depense' then
    insert into ledger_entries(operation_id, account_id, amount) values (op.id, src.id, -(op.amount + coalesce(op.fees,0)));
  elsif op.op_type = 'transfert' then
    insert into ledger_entries(operation_id, account_id, amount) values (op.id, src.id, -(op.amount + coalesce(op.fees,0))), (op.id, dst.id, op.amount);
  elsif op.op_type = 'change' then
    insert into ledger_entries(operation_id, account_id, amount) values (op.id, src.id, -(op.amount + coalesce(op.fees,0))), (op.id, dst.id, op.dest_amount);
  else raise exception 'Type non exécutable ici';
  end if;
  update operations set status='executee', executed_by=auth.uid(), executed_at=now() where id=_id;
  perform log_audit('execution','operation',_id, jsonb_build_object('amount',op.amount,'currency',op.currency));
end $$;

create or replace function public.set_opening_balance(_account uuid, _amount numeric, _date date) returns void language plpgsql security definer set search_path=public as $$
begin
  if not has_role(auth.uid(),'financier') then raise exception 'Non autorisé'; end if;
  update accounts set opening_balance=_amount, opening_date=_date where id=_account and opening_validated=false;
  if not found then raise exception 'Solde déjà validé'; end if;
  perform log_audit('saisie_solde_ouverture','account',_account, jsonb_build_object('amount',_amount,'date',_date));
end $$;
create or replace function public.validate_opening_balance(_account uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  if not has_role(auth.uid(),'dg') then raise exception 'Seule la DG valide'; end if;
  update accounts set opening_validated=true where id=_account and opening_balance is not null and opening_validated=false;
  if not found then raise exception 'Rien à valider'; end if;
  perform log_audit('validation_solde_ouverture','account',_account);
end $$;

-- Documents
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.operations(id),
  doc_type text not null, storage_path text not null,
  status doc_status not null default 'recu', comment text,
  uploaded_by uuid not null default auth.uid(), via_qr boolean not null default false,
  received_at timestamptz not null default now(),
  verified_by uuid, verified_at timestamptz
);
grant select, insert on public.documents to authenticated;
grant all on public.documents to service_role;
alter table public.documents enable row level security;
create policy "staff read docs" on public.documents for select to authenticated using (public.is_staff(auth.uid()));
create policy "staff add docs" on public.documents for insert to authenticated with check (public.is_staff(auth.uid()) and uploaded_by=auth.uid() and status='recu' and via_qr=false);

create or replace function public.review_document(_id uuid, _ok boolean, _comment text) returns void language plpgsql security definer set search_path=public as $$
begin
  if not (has_role(auth.uid(),'dg') or has_role(auth.uid(),'financier')) then raise exception 'Non autorisé'; end if;
  if exists (select 1 from documents where id=_id and uploaded_by=auth.uid()) then raise exception 'Vous ne pouvez pas vérifier votre propre dépôt'; end if;
  update documents set status = case when _ok then 'verifie'::doc_status else 'rejete'::doc_status end, comment=_comment, verified_by=auth.uid(), verified_at=now()
   where id=_id and status='recu';
  if not found then raise exception 'Document déjà traité'; end if;
  perform log_audit(case when _ok then 'document_verifie' else 'document_rejete' end,'document',_id, jsonb_build_object('comment',_comment));
end $$;

-- QR upload tokens
create table public.upload_tokens (
  id uuid primary key default gen_random_uuid(),
  token text unique not null default encode(gen_random_bytes(24),'hex'),
  operation_id uuid not null references public.operations(id),
  created_by uuid not null default auth.uid(),
  expires_at timestamptz not null default now() + interval '15 minutes',
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);
grant select on public.upload_tokens to authenticated;
grant all on public.upload_tokens to service_role;
alter table public.upload_tokens enable row level security;
create policy "creator reads tokens" on public.upload_tokens for select to authenticated using (created_by = auth.uid());

create or replace function public.create_upload_token(_op uuid) returns table(token text, expires_at timestamptz) language plpgsql security definer set search_path=public as $$
begin
  if not has_role(auth.uid(),'financier') then raise exception 'Non autorisé'; end if;
  if not exists (select 1 from operations where id=_op) then raise exception 'Opération introuvable'; end if;
  update upload_tokens set revoked=true where operation_id=_op and created_by=auth.uid() and not revoked;
  perform log_audit('qr_genere','operation',_op);
  return query insert into upload_tokens(operation_id) values (_op) returning upload_tokens.token, upload_tokens.expires_at;
end $$;

create or replace function public.revoke_upload_token(_token text) returns void language sql security definer set search_path=public as $$
  update upload_tokens set revoked=true where token=_token and created_by=auth.uid();
$$;

create or replace function public.resolve_upload_token(_token text) returns table(operation_id uuid, reference text, motif text, amount numeric, currency currency_code, expires_at timestamptz)
language plpgsql security definer set search_path=public as $$
begin
  if not is_staff(auth.uid()) then raise exception 'Accès refusé'; end if;
  return query select o.id, o.reference, o.motif, o.amount, o.currency, t.expires_at
    from upload_tokens t join operations o on o.id=t.operation_id
    where t.token=_token and not t.revoked and t.expires_at > now();
  if not found then raise exception 'QR code invalide, expiré ou révoqué'; end if;
end $$;

create or replace function public.register_qr_document(_token text, _doc_type text, _path text) returns uuid language plpgsql security definer set search_path=public as $$
declare t upload_tokens; new_id uuid;
begin
  if not is_staff(auth.uid()) then raise exception 'Accès refusé'; end if;
  select * into t from upload_tokens where token=_token and not revoked and expires_at > now();
  if t.id is null then raise exception 'QR code invalide, expiré ou révoqué'; end if;
  if split_part(_path,'/',1) <> t.operation_id::text then raise exception 'Chemin invalide'; end if;
  insert into documents(operation_id, doc_type, storage_path, uploaded_by, via_qr) values (t.operation_id, _doc_type, _path, auth.uid(), true) returning id into new_id;
  perform log_audit('document_depose_qr','document',new_id, jsonb_build_object('operation',t.operation_id,'type',_doc_type));
  return new_id;
end $$;

revoke execute on all functions in schema public from anon;

alter publication supabase_realtime add table public.operations;
alter publication supabase_realtime add table public.documents;
