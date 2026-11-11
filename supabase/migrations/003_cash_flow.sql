begin;

create table public.finance_debts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  direction text not null check (direction in ('payable','receivable')),
  counterparty text not null check (char_length(btrim(counterparty)) between 1 and 200),
  person text not null check (person in ('dika','affi')),
  principal bigint not null check (principal between 1 and 999999999999),
  start_date date not null,
  installment_count integer not null default 1 check (installment_count between 1 and 360 and installment_count<=principal),
  first_payment_date date check (first_payment_date >= start_date),
  due_date date check (due_date >= start_date),
  notes text not null default '' check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  unique(owner_id,id)
);
create table public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  transaction_date date not null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  kind text not null check (kind in ('income','expense','transfer','opening')),
  person text not null check (person in ('dika','affi')),
  destination text check (destination in ('dika','affi')),
  category text not null check (category in (
    'gaji','bonus','usaha','hadiah','pinjaman','kewajiban','piutang','subscription','rumah','wifi','listrik',
    'uang_sangu','groceries','savings','transportasi','kesehatan','pendidikan','hiburan','makan_di_luar','donasi','lainnya','transfer','saldo_awal')),
  amount bigint not null check (amount between 1 and 999999999999),
  status text not null check (status in ('paid','pending','cancelled')),
  debt_id uuid,
  notes text not null default '' check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  foreign key(owner_id,debt_id) references public.finance_debts(owner_id,id) on delete set null(debt_id),
  check ((kind='transfer' and destination is not null and destination<>person and category='transfer' and debt_id is null)
      or (kind<>'transfer' and destination is null)),
  check (kind<>'opening' or (category='saldo_awal' and status='paid' and debt_id is null)),
  check (kind not in ('income','expense') or category not in ('transfer','saldo_awal'))
);
create index finance_transactions_owner_date on public.finance_transactions(owner_id,transaction_date,id);
create index finance_transactions_debt on public.finance_transactions(owner_id,debt_id);
create index finance_debts_owner on public.finance_debts(owner_id,start_date);

-- Serialize repayments per debt; row locking also coordinates principal edits.
create function public.validate_finance_payment() returns trigger
language plpgsql set search_path='' as $$
declare d public.finance_debts; already_paid numeric;
begin
  if new.debt_id is null then return new; end if;
  select * into d from public.finance_debts where owner_id=new.owner_id and id=new.debt_id for update;
  if not found or new.person<>d.person or new.transaction_date<d.start_date
      or new.kind<>(case when d.direction='payable' then 'expense' else 'income' end) then
    raise exception 'Invalid debt payment' using errcode='23514';
  end if;
  select coalesce(sum(amount),0) into already_paid from public.finance_transactions
    where owner_id=new.owner_id and debt_id=new.debt_id and status='paid' and id<>new.id;
  if already_paid + (case when new.status='paid' then new.amount else 0 end) > d.principal then
    raise exception 'Payment exceeds principal' using errcode='23514';
  end if;
  return new;
end $$;
create trigger finance_payment_guard before insert or update on public.finance_transactions
  for each row execute function public.validate_finance_payment();

create function public.validate_finance_debt() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.principal < (select coalesce(sum(amount),0) from public.finance_transactions
      where owner_id=new.owner_id and debt_id=new.id and status='paid') then
    raise exception 'Principal below repayments' using errcode='23514';
  end if;
  if exists(select 1 from public.finance_transactions where owner_id=new.owner_id and debt_id=new.id
      and (person<>new.person or transaction_date<new.start_date
      or kind<>case when new.direction='payable' then 'expense' else 'income' end)) then
    raise exception 'Existing payments conflict with debt edit' using errcode='23514';
  end if;
  return new;
end $$;
create trigger finance_debt_guard before update on public.finance_debts
  for each row execute function public.validate_finance_debt();

alter table public.finance_transactions enable row level security;
alter table public.finance_debts enable row level security;
revoke all on public.finance_transactions, public.finance_debts from public,anon,authenticated;
grant select,insert,update,delete on public.finance_transactions,public.finance_debts to authenticated;
create policy finance_transactions_owner on public.finance_transactions for all to authenticated
  using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy finance_debts_owner on public.finance_debts for all to authenticated
  using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
revoke all on function public.validate_finance_payment(),public.validate_finance_debt() from public,anon,authenticated;

-- Aggregation runs in PostgreSQL over the complete ledger, not PostgREST's 1000-row page.
-- Amounts are JSON strings so total Rupiah remains exact beyond JS safe integers.
create function public.finance_report(p_month date) returns jsonb
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
), history as (
  select to_char(m.month,'YYYY-MM') as month,
    coalesce(sum(t.amount) filter(where t.kind='income' and t.status='paid'),0)::text as income,
    coalesce(sum(t.amount) filter(where t.kind='expense' and t.status='paid'),0)::text as spending,
    coalesce(sum(t.amount) filter(where t.kind='expense' and t.status='pending'),0)::text as pending
  from bounds b cross join lateral generate_series(b.first-interval '11 months',b.first,interval '1 month') as m(month)
  left join tx t on t.transaction_date>=m.month and t.transaction_date<m.month+interval '1 month'
  group by m.month order by m.month
), debts as (
  select d.id,d.title,d.direction,d.counterparty,d.person,d.principal,d.start_date,d.due_date,d.notes,d.installment_count,d.first_payment_date,
    coalesce(sum(t.amount) filter(where t.status='paid'),0)::text as paid,
    (d.principal-coalesce(sum(t.amount) filter(where t.status='paid'),0))::text as remaining
  from public.finance_debts d cross join bounds b
  left join tx t on t.debt_id=d.id
  where d.owner_id=(select auth.uid()) and d.start_date<b.next
  group by d.id order by d.due_date nulls last,d.created_at
)
select jsonb_build_object(
 'income', (select coalesce(sum(amount),0)::text from current_tx where kind='income' and status='paid'),
 'spending', (select coalesce(sum(amount),0)::text from current_tx where kind='expense' and status='paid'),
 'pending', (select coalesce(sum(amount),0)::text from current_tx where kind='expense' and status='pending'),
 'balances',(select coalesce(jsonb_agg(to_jsonb(b) order by b.person desc),'[]'::jsonb) from balances b),
 'pivot',(select coalesce(jsonb_agg(to_jsonb(p) order by p.paid::numeric desc),'[]'::jsonb) from pivot p),
 'history',(select coalesce(jsonb_agg(to_jsonb(h) order by h.month),'[]'::jsonb) from history h),
 'debts',(select coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) from debts d)
);
$$;
revoke all on function public.finance_report(date) from public,anon,authenticated;
grant execute on function public.finance_report(date) to authenticated;
commit;
