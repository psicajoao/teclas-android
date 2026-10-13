-- Palco Keys: controle de acesso. Cole tudo no SQL Editor do Supabase e clique em Run.

create table if not exists pk_licenses (
  email text primary key,
  expires_at timestamptz,               -- vazio = acesso permanente
  active boolean not null default true, -- false = acesso cancelado
  max_devices int not null default 3,
  is_admin boolean not null default false,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists pk_devices (
  email text not null,
  device_id text not null,
  name text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (email, device_id)
);

alter table pk_licenses enable row level security;
alter table pk_devices enable row level security;

create or replace function pk_is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from pk_licenses
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and is_admin and active)
$$;

drop policy if exists pk_admin_licenses on pk_licenses;
create policy pk_admin_licenses on pk_licenses for all using (pk_is_admin()) with check (pk_is_admin());
drop policy if exists pk_admin_devices on pk_devices;
create policy pk_admin_devices on pk_devices for all using (pk_is_admin()) with check (pk_is_admin());

-- O app chama esta função ao abrir. Ela decide se a pessoa pode usar.
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
      insert into pk_licenses(email, expires_at, max_devices, note)
        values (em, now() + interval '7 days', 2, 'teste grátis') returning * into lic;
    else
      return jsonb_build_object('ok', false, 'reason', 'not_listed');
    end if;
  end if;
  if not lic.active then return jsonb_build_object('ok', false, 'reason', 'revoked'); end if;
  if lic.expires_at is not null and lic.expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'expired', 'until', lic.expires_at);
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
  return jsonb_build_object('ok', true, 'until', lic.expires_at, 'admin', lic.is_admin);
end $$;

grant execute on function pk_check_access(text, text, boolean) to authenticated;

-- TROQUE pelo seu e-mail e rode de novo só esta linha: você vira administrador.
insert into pk_licenses(email, is_admin, max_devices, note)
values ('psicajoao@gmail.com', true, 10, 'dono')
on conflict (email) do update set is_admin = true, active = true, expires_at = null;
