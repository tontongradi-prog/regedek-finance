create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = _user_id
      and ur.role = _role
      and p.active = true
  )
$$;

revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;
drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles for update to authenticated
  using (id = auth.uid() and active = true)
  with check (id = auth.uid() and active = true);

revoke update on public.accounts from authenticated;
grant update (name, institution, manager_id, notes)
  on public.accounts to authenticated;

revoke insert, update, delete, truncate on public.audit_log from anon, authenticated;

create or replace view public.account_balances with (security_invoker = true) as
select a.id, a.name, a.currency, a.account_type, a.active,
  case when a.opening_validated then coalesce(a.opening_balance, 0) else 0 end as opening_balance,
  case when a.opening_validated then coalesce(a.opening_balance, 0) else 0 end
    + coalesce((select sum(l.amount) from public.ledger_entries l where l.account_id = a.id), 0) as balance,
  coalesce((
    select sum(o.amount)
    from public.operations o
    where o.account_id = a.id
      and o.status = 'approuvee'
      and o.op_type in ('depense', 'transfert', 'change')
  ), 0) as committed
from public.accounts a;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  operation_id uuid not null references public.operations(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);
create index notifications_recipient_created_idx
  on public.notifications(recipient_id, created_at desc);
grant select on public.notifications to authenticated;
alter table public.notifications enable row level security;
create policy "users read own notifications" on public.notifications for select to authenticated
  using (recipient_id = auth.uid() and public.is_staff(auth.uid()));

create or replace function public.submit_operation(_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  op public.operations;
begin
  if not public.has_role(auth.uid(), 'financier') then
    raise exception 'Seul le responsable financier actif peut soumettre une opération';
  end if;

  select * into op from public.operations where id = _id for update;
  if op.id is null or op.created_by <> auth.uid() or op.status <> 'brouillon' then
    raise exception 'Opération introuvable ou non modifiable';
  end if;
  if op.op_type in ('transfert', 'change') then
    if op.dest_account_id is null or op.dest_account_id = op.account_id then
      raise exception 'Un compte destination différent est requis';
    end if;
    if not exists (
      select 1 from public.accounts a
      where a.id = op.dest_account_id and a.active
    ) then
      raise exception 'Le compte destination est introuvable ou inactif';
    end if;
  end if;
  if op.op_type = 'transfert' and exists (
    select 1
    from public.accounts src
    join public.accounts dst on dst.id = op.dest_account_id
    where src.id = op.account_id and src.currency <> dst.currency
  ) then
    raise exception 'Transfert entre devises différentes : utilisez une opération de change';
  end if;

  update public.operations
  set status = 'soumise', submitted_at = now()
  where id = _id;

  insert into public.notifications(recipient_id, operation_id, message)
  select ur.user_id, _id, 'Nouvelle opération à valider : ' || op.reference
  from public.user_roles ur
  join public.profiles p on p.id = ur.user_id and p.active
  where ur.role = 'dg';

  perform public.log_audit(
    'soumission',
    'operation',
    _id,
    jsonb_build_object('old_status', op.status, 'new_status', 'soumise')
  );
end
$$;

create or replace function public.decide_operation(
  _id uuid,
  _approve boolean,
  _comment text,
  _override boolean default false,
  _override_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  op public.operations;
  next_status public.op_status;
begin
  if not public.has_role(auth.uid(), 'dg') then
    raise exception 'Seule la DG active peut décider';
  end if;
  if _approve is null then
    raise exception 'Une décision explicite est obligatoire';
  end if;

  select * into op from public.operations where id = _id for update;
  if op.id is null or op.status not in ('soumise', 'en_attente_complement') then
    raise exception 'Opération non disponible pour décision';
  end if;
  if op.created_by = auth.uid() then
    raise exception 'Vous ne pouvez pas approuver votre propre opération';
  end if;
  if not _approve and coalesce(trim(_comment), '') = '' then
    raise exception 'Motif de rejet obligatoire';
  end if;
  if coalesce(_override, false) and coalesce(trim(_override_reason), '') = '' then
    raise exception 'Motif de dérogation obligatoire';
  end if;

  next_status := case when _approve then 'approuvee'::public.op_status else 'rejetee'::public.op_status end;
  update public.operations
  set status = next_status,
      decided_by = auth.uid(),
      decided_at = now(),
      decision_comment = nullif(trim(_comment), ''),
      overdraft_override = _approve and coalesce(_override, false),
      override_reason = case when _approve and coalesce(_override, false) then trim(_override_reason) else null end
  where id = _id;

  insert into public.notifications(recipient_id, operation_id, message)
  values (
    op.created_by,
    _id,
    'Décision DG pour ' || op.reference || ' : ' ||
      case when _approve then 'opération approuvée.' else 'opération rejetée. Motif : ' || trim(_comment) end
  );

  perform public.log_audit(
    case when _approve then 'approbation' else 'rejet' end,
    'operation',
    _id,
    jsonb_build_object(
      'old_status', op.status,
      'new_status', next_status,
      'comment', nullif(trim(_comment), ''),
      'override', _approve and coalesce(_override, false),
      'override_reason', case when _approve and coalesce(_override, false) then trim(_override_reason) else null end
    )
  );
end
$$;

create or replace function public.defer_operation(_id uuid, _comment text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  op public.operations;
begin
  if not public.has_role(auth.uid(), 'dg') then
    raise exception 'Seule la DG active peut mettre une opération en attente';
  end if;
  if coalesce(trim(_comment), '') = '' then
    raise exception 'Un commentaire précisant le complément attendu est obligatoire';
  end if;

  select * into op from public.operations where id = _id for update;
  if op.id is null or op.status <> 'soumise' then
    raise exception 'Opération non disponible pour mise en attente';
  end if;
  if op.created_by = auth.uid() then
    raise exception 'Vous ne pouvez pas traiter votre propre opération';
  end if;

  update public.operations
  set status = 'en_attente_complement',
      decided_by = auth.uid(),
      decided_at = now(),
      decision_comment = trim(_comment)
  where id = _id;

  insert into public.notifications(recipient_id, operation_id, message)
  values (
    op.created_by,
    _id,
    'Complément demandé pour ' || op.reference || ' : ' || trim(_comment)
  );

  perform public.log_audit(
    'mise_en_attente_complement',
    'operation',
    _id,
    jsonb_build_object(
      'old_status', op.status,
      'new_status', 'en_attente_complement',
      'comment', trim(_comment)
    )
  );
end
$$;

create or replace function public.resubmit_operation(_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  op public.operations;
begin
  if not public.has_role(auth.uid(), 'financier') then
    raise exception 'Seul le responsable financier actif peut soumettre une opération';
  end if;

  select * into op from public.operations where id = _id for update;
  if op.id is null or op.created_by <> auth.uid() or op.status <> 'rejetee' then
    raise exception 'Seule une opération rejetée créée par vous peut être resoumise';
  end if;

  update public.operations
  set status = 'soumise',
      submitted_at = now(),
      decided_by = null,
      decided_at = null,
      decision_comment = null,
      overdraft_override = false,
      override_reason = null
  where id = _id;

  insert into public.notifications(recipient_id, operation_id, message)
  select ur.user_id, _id, 'Opération resoumise à valider : ' || op.reference
  from public.user_roles ur
  join public.profiles p on p.id = ur.user_id and p.active
  where ur.role = 'dg';

  perform public.log_audit(
    'resoumission',
    'operation',
    _id,
    jsonb_build_object('old_status', op.status, 'new_status', 'soumise', 'previous_decision_comment', op.decision_comment)
  );
end
$$;

create or replace function public.execute_operation(_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  op public.operations;
  bal numeric(18,2);
  src public.accounts;
  dst public.accounts;
begin
  if not public.has_role(auth.uid(), 'financier') then
    raise exception 'Seul le responsable financier actif peut exécuter une opération';
  end if;

  select * into op from public.operations where id = _id for update;
  if op.id is null or op.status <> 'approuvee' then
    raise exception 'Opération non approuvée ou déjà exécutée';
  end if;

  if op.op_type in ('transfert', 'change') then
    if op.dest_account_id is null or op.dest_account_id = op.account_id then
      raise exception 'Un compte destination différent est requis';
    end if;
    perform 1 from public.accounts
    where id in (op.account_id, op.dest_account_id)
    order by id
    for update;
  else
    perform 1 from public.accounts where id = op.account_id for update;
  end if;

  select * into src from public.accounts where id = op.account_id;
  if src.id is null or not src.active then
    raise exception 'Compte source introuvable ou inactif';
  end if;
  if src.currency <> op.currency then
    raise exception 'Devise incohérente avec le compte';
  end if;

  if op.op_type in ('depense', 'transfert', 'change') then
    select
      case when src.opening_validated then coalesce(src.opening_balance, 0) else 0 end
      + coalesce(sum(le.amount), 0)
    into bal
    from public.ledger_entries le
    where le.account_id = src.id;
    if bal < op.amount + coalesce(op.fees, 0) then
      raise exception 'Solde insuffisant (disponible: % %). Les fonds doivent être réellement disponibles.', bal, src.currency;
    end if;
  end if;

  if op.op_type in ('transfert', 'change') then
    select * into dst from public.accounts where id = op.dest_account_id;
    if dst.id is null or not dst.active then
      raise exception 'Compte destination requis et actif';
    end if;
    if op.op_type = 'transfert' and dst.currency <> src.currency then
      raise exception 'Transfert entre devises différentes : utilisez une opération de change';
    end if;
    if op.op_type = 'change' and (
      dst.currency = src.currency or op.dest_amount is null or op.exchange_rate is null
    ) then
      raise exception 'Change : devise destination, taux et montant destination requis';
    end if;
  end if;

  if op.op_type = 'recette' then
    insert into public.ledger_entries(operation_id, account_id, amount)
    values (op.id, src.id, op.amount);
  elsif op.op_type = 'depense' then
    insert into public.ledger_entries(operation_id, account_id, amount)
    values (op.id, src.id, -(op.amount + coalesce(op.fees, 0)));
  elsif op.op_type = 'transfert' then
    insert into public.ledger_entries(operation_id, account_id, amount)
    values
      (op.id, src.id, -(op.amount + coalesce(op.fees, 0))),
      (op.id, dst.id, op.amount);
  elsif op.op_type = 'change' then
    insert into public.ledger_entries(operation_id, account_id, amount)
    values
      (op.id, src.id, -(op.amount + coalesce(op.fees, 0))),
      (op.id, dst.id, op.dest_amount);
  else
    raise exception 'Type non exécutable ici';
  end if;

  update public.operations
  set status = 'executee', executed_by = auth.uid(), executed_at = now()
  where id = _id;
  perform public.log_audit(
    'execution',
    'operation',
    _id,
    jsonb_build_object('amount', op.amount, 'currency', op.currency, 'old_status', op.status, 'new_status', 'executee')
  );
end
$$;

revoke all on function public.submit_operation(uuid) from public, anon;
revoke all on function public.decide_operation(uuid, boolean, text, boolean, text) from public, anon;
revoke all on function public.defer_operation(uuid, text) from public, anon;
revoke all on function public.resubmit_operation(uuid) from public, anon;
revoke all on function public.execute_operation(uuid) from public, anon;
grant execute on function public.submit_operation(uuid) to authenticated;
grant execute on function public.decide_operation(uuid, boolean, text, boolean, text) to authenticated;
grant execute on function public.defer_operation(uuid, text) to authenticated;
grant execute on function public.resubmit_operation(uuid) to authenticated;
grant execute on function public.execute_operation(uuid) to authenticated;

alter publication supabase_realtime add table public.notifications;
