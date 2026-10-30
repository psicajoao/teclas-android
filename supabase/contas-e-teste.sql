-- Contas com senha + teste grátis de 7 dias (1 por aparelho). Cole no SQL Editor do Supabase e clique em Run.
-- Esta versão devolve 'trial' (true enquanto o acesso é o teste) para o app mostrar a contagem regressiva.

create table if not exists pk_trials (
  device_id text primary key,
  email text,
  created_at timestamptz not null default now()
);
alter table pk_trials enable row level security;

create or replace function pk_check_access(p_device text, p_name text default '', p_trial boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  em text := lower(coalesce(auth.jwt() ->> 'email', ''));
  lic pk_licenses;
  n int;
begin
  if em = '' then return jsonb_build_object('ok', false, 'reason', 'no_session'); end if;
  select * into lic from pk_licenses where lower(email) = em;
  if not found then
    if p_trial then
      if exists (select 1 from pk_trials where device_id = p_device) then
        return jsonb_build_object('ok', false, 'reason', 'trial_used');
      end if;
      insert into pk_licenses(email, expires_at, max_devices, note)
        values (em, now() + interval '7 days', 2, 'teste grátis') returning * into lic;
      insert into pk_trials(device_id, email) values (p_device, em);
    else
      return jsonb_build_object('ok', false, 'reason', 'not_listed');
    end if;
  end if;
  if not lic.active then return jsonb_build_object('ok', false, 'reason', 'revoked'); end if;
  if lic.expires_at is not null and lic.expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'expired', 'until', lic.expires_at, 'trial', lic.note = 'teste grátis');
  end if;
  if exists (select 1 from pk_devices where lower(email) = em and device_id = p_device) then
    update pk_devices set last_seen = now(), name = coalesce(nullif(p_name, ''), name)
      where lower(email) = em and device_id = p_device;
  else
    select count(*) into n from pk_devices where lower(email) = em;
    if n >= lic.max_devices then
      return jsonb_build_object('ok', false, 'reason', 'device_limit');
    end if;
    insert into pk_devices(email, device_id, name) values (em, p_device, left(p_name, 120));
  end if;
  return jsonb_build_object('ok', true, 'until', lic.expires_at, 'admin', lic.is_admin, 'trial', lic.note = 'teste grátis' and lic.expires_at is not null);
end $$;

grant execute on function pk_check_access(text, text, boolean) to authenticated;
