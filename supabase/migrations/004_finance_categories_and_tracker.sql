begin;

-- Category codes are stable; editing a label updates all historical display names.
create table public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  code text not null default ('custom_' || replace(gen_random_uuid()::text,'-',''))
    check (code ~ '^[a-z][a-z0-9_]{0,79}$' and code <> 'pinjaman'),
  label text not null check (char_length(btrim(label)) between 1 and 80),
  unique(owner_id,code)
);
create unique index finance_categories_label on public.finance_categories(owner_id,lower(btrim(label)));
alter table public.finance_categories enable row level security;
revoke all on public.finance_categories from public,anon,authenticated;
grant select on public.finance_categories to authenticated;
grant insert(owner_id,label) on public.finance_categories to authenticated;
grant update(label) on public.finance_categories to authenticated;
create policy finance_categories_owner on public.finance_categories for all to authenticated
  using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);

-- Only this trigger may seed the fixed default codes, for newly created accounts.
create function public.seed_finance_categories() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.finance_categories(owner_id,code,label)
  select new.id,c.code,c.label from (values
    ('gaji','Gaji'),
    ('bonus','Bonus'),
    ('usaha','Usaha'),
    ('hadiah','Hadiah'),
    ('hutang','Hutang'),
    ('kewajiban','Kewajiban'),
    ('piutang','Piutang'),
    ('subscription','Subscription'),
    ('rumah','Rumah'),
    ('wifi','WiFi'),
    ('listrik','Listrik'),
    ('uang_sangu','Uang sangu'),
    ('groceries','Groceries'),
    ('savings','Savings'),
    ('transportasi','Transportasi'),
    ('kesehatan','Kesehatan'),
    ('pendidikan','Pendidikan'),
    ('hiburan','Hiburan'),
    ('makan_di_luar','Makan di luar'),
    ('donasi','Donasi'),
    ('lainnya','Lainnya'),
    ('transfer','Transfer'),
    ('saldo_awal','Saldo awal')
  ) as c(code,label);
  return new;
end $$;
revoke all on function public.seed_finance_categories() from public,anon,authenticated;
create trigger seed_finance_categories after insert on auth.users
  for each row execute function public.seed_finance_categories();
insert into public.finance_categories(owner_id,code,label)
  select u.id,c.code,c.label from auth.users u cross join (values
    ('gaji','Gaji'),
    ('bonus','Bonus'),
    ('usaha','Usaha'),
    ('hadiah','Hadiah'),
    ('hutang','Hutang'),
    ('kewajiban','Kewajiban'),
    ('piutang','Piutang'),
    ('subscription','Subscription'),
    ('rumah','Rumah'),
    ('wifi','WiFi'),
    ('listrik','Listrik'),
    ('uang_sangu','Uang sangu'),
    ('groceries','Groceries'),
    ('savings','Savings'),
    ('transportasi','Transportasi'),
    ('kesehatan','Kesehatan'),
    ('pendidikan','Pendidikan'),
    ('hiburan','Hiburan'),
    ('makan_di_luar','Makan di luar'),
    ('donasi','Donasi'),
    ('lainnya','Lainnya'),
    ('transfer','Transfer'),
    ('saldo_awal','Saldo awal')
  ) as c(code,label);

alter table public.finance_transactions drop constraint finance_transactions_category_check;
update public.finance_transactions set category='hutang' where category='pinjaman';
alter table public.finance_transactions add constraint finance_transactions_category_owner_fkey
  foreign key(owner_id,category) references public.finance_categories(owner_id,code);

-- Debt progress is metadata only. Existing cash ledger entries are never deleted
-- or reversed: they remain genuine historical income/expenses until reviewed.
create table public.finance_debt_payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  debt_id uuid not null,
  payment_date date not null,
  amount bigint not null check (amount between 1 and 999999999999),
  status text not null check (status in ('paid','pending','cancelled')),
  notes text not null default '' check (char_length(notes)<=2000),
  source_transaction_id uuid unique references public.finance_transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key(owner_id,debt_id) references public.finance_debts(owner_id,id) on delete cascade
);
insert into public.finance_debt_payments(id,owner_id,debt_id,payment_date,amount,status,notes,source_transaction_id,created_at)
  select id,owner_id,debt_id,transaction_date,amount,status,notes,id,created_at
  from public.finance_transactions where debt_id is not null;
create index finance_debt_payments_owner_debt_date on public.finance_debt_payments(owner_id,debt_id,payment_date);
alter table public.finance_debt_payments enable row level security;
revoke all on public.finance_debt_payments from public,anon,authenticated;
grant select on public.finance_debt_payments to authenticated;
grant insert(owner_id,debt_id,payment_date,amount,status,notes) on public.finance_debt_payments to authenticated;
grant update(payment_date,amount,status,notes) on public.finance_debt_payments to authenticated;
grant delete on public.finance_debt_payments to authenticated;
create policy finance_debt_payments_owner on public.finance_debt_payments for all to authenticated
  using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);

drop trigger finance_payment_guard on public.finance_transactions;
drop function public.validate_finance_payment();
create function public.validate_debt_record() returns trigger
language plpgsql set search_path='' as $$
declare d public.finance_debts; already_paid numeric;
begin
  select * into d from public.finance_debts where owner_id=new.owner_id and id=new.debt_id for update;
  if not found or new.payment_date<d.start_date then
    raise exception 'Invalid debt record' using errcode='23514';
  end if;
  select coalesce(sum(amount),0) into already_paid from public.finance_debt_payments
    where owner_id=new.owner_id and debt_id=new.debt_id and status='paid' and id<>new.id;
  if already_paid+(case when new.status='paid' then new.amount else 0 end)>d.principal then
    raise exception 'Record exceeds principal' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function public.validate_debt_record() from public,anon,authenticated;
create trigger finance_debt_record_guard before insert or update on public.finance_debt_payments
  for each row execute function public.validate_debt_record();

create or replace function public.validate_finance_debt() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.principal<(select coalesce(sum(amount),0) from public.finance_debt_payments
      where owner_id=new.owner_id and debt_id=new.id and status='paid')
      or exists(select 1 from public.finance_debt_payments where owner_id=new.owner_id and debt_id=new.id and payment_date<new.start_date) then
    raise exception 'Debt conflicts with records' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function public.validate_finance_debt() from public,anon,authenticated;

create or replace function public.finance_report(p_month date) returns jsonb
language sql stable security invoker set search_path='' as $$
with bounds as (
  select date_trunc('month',p_month)::date as first,
         (date_trunc('month',p_month)+interval '1 month')::date as next
), tx as (
  select t.* from public.finance_transactions t,bounds b
  where t.owner_id=(select auth.uid()) and t.transaction_date<b.next
), current_tx as (
  select t.* from tx t,bounds b where t.transaction_date>=b.first
), movement as (
  select person,transaction_date,status,kind,
    case when kind in ('income','opening') then amount else -amount end as delta
  from tx
  union all select destination,transaction_date,status,kind,amount from tx where kind='transfer'
), balances as (
  select p.person,
    coalesce(sum(m.delta) filter(where m.status='paid' and m.transaction_date<b.first),0)::text as opening,
    coalesce(sum(m.delta) filter(where m.status='paid'),0)::text as closing,
    (select coalesce(sum(case when t.person=p.person then t.amount else -t.amount end),0)::text
      from current_tx t where t.status='pending' and t.kind in ('expense','transfer')
      and (t.person=p.person or (t.kind='transfer' and t.destination=p.person))) as reserved
  from (values('dika'),('affi')) as p(person) cross join bounds b
  left join movement m on m.person=p.person group by p.person,b.first
), pivot as (
  select category,
    coalesce(sum(amount) filter(where status='paid' and person='dika'),0)::text as dika,
    coalesce(sum(amount) filter(where status='paid' and person='affi'),0)::text as affi,
    coalesce(sum(amount) filter(where status='paid'),0)::text as paid,
    coalesce(sum(amount) filter(where status='pending'),0)::text as pending
  from current_tx where kind='expense' and status<>'cancelled' group by category
), debts as (
  select d.id,d.title,d.direction,d.counterparty,d.person,d.principal,d.start_date,d.due_date,d.notes,d.installment_count,d.first_payment_date,
    coalesce(sum(t.amount) filter(where t.status='paid'),0)::text as paid,
    (d.principal-coalesce(sum(t.amount) filter(where t.status='paid'),0))::text as remaining
  from public.finance_debts d cross join bounds b
  left join public.finance_debt_payments t on t.debt_id=d.id and t.owner_id=d.owner_id and t.payment_date<b.next
  where d.owner_id=(select auth.uid()) and d.start_date<b.next
  group by d.id order by d.due_date nulls last,d.created_at
)
select jsonb_build_object(
 'income', (select coalesce(sum(amount),0)::text from current_tx where kind='income' and status='paid'),
 'spending', (select coalesce(sum(amount),0)::text from current_tx where kind='expense' and status='paid'),
 'pending', (select coalesce(sum(amount),0)::text from current_tx where kind='expense' and status='pending'),
 'balances',(select coalesce(jsonb_agg(to_jsonb(b) order by b.person desc),'[]'::jsonb) from balances b),
 'pivot',(select coalesce(jsonb_agg(to_jsonb(p) order by p.paid::numeric desc),'[]'::jsonb) from pivot p),
 'categories',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'code',c.code,'label',c.label) order by c.label),'[]'::jsonb) from public.finance_categories c where c.owner_id=(select auth.uid())),
 'payments',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'debt_id',p.debt_id,'payment_date',p.payment_date,'amount',p.amount,'status',p.status,'notes',p.notes) order by p.payment_date desc,p.created_at desc),'[]'::jsonb) from public.finance_debt_payments p,bounds b where p.owner_id=(select auth.uid()) and p.payment_date<b.next),
 'debts',(select coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) from debts d)
);
$$;
revoke all on function public.finance_report(date) from public,anon;
grant execute on function public.finance_report(date) to authenticated;
commit;
