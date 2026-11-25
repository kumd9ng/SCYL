begin;

-- One private identity record belongs to the shared Auth user, not either app.
create schema if not exists account_private;
revoke all on schema account_private from public,anon,authenticated;
create table account_private.member_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cat_id text not null references modak_private.meow_catalogue(cat_id),
  mbti text not null check(mbti ~ '^[IE][NS][TF][JP]$'),
  confirmed_at timestamptz not null default clock_timestamp(),
  source text not null check(source in ('meow','scyl_legacy','shared'))
);
alter table account_private.member_profiles enable row level security;
revoke all on account_private.member_profiles from public,anon,authenticated,service_role;

-- MEOW's previously confirmed server identity wins over a conflicting SCYL
-- metadata copy. No location, social permission, energy or public ID is copied.
insert into account_private.member_profiles(user_id,cat_id,mbti,confirmed_at,source)
select user_id,cat_id,mbti,created_at,'meow' from modak_private.meow_cats;

-- One-time import of valid legacy SCYL selections only where MEOW had none.
-- to_jsonb also makes reduced synthetic Auth fixtures without metadata safe.
-- Later Auth metadata changes are never a read/write source for either app.
insert into account_private.member_profiles(user_id,cat_id,mbti,source)
select u.id,legacy.value->>'catId',legacy.value->>'mbti','scyl_legacy'
from auth.users u
cross join lateral (select to_jsonb(u)->'raw_user_meta_data'->'scyl_profile_v1' as value) legacy
join modak_private.meow_catalogue catalogue on catalogue.cat_id=legacy.value->>'catId'
where jsonb_typeof(legacy.value)='object'
  and jsonb_typeof(legacy.value->'catId')='string'
  and jsonb_typeof(legacy.value->'mbti')='string'
  and legacy.value->>'mbti' ~ '^[IE][NS][TF][JP]$'
on conflict(user_id) do nothing;

create function account_private.profile_json(profile account_private.member_profiles) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('userId',profile.user_id,'catId',profile.cat_id,'mbti',profile.mbti,'confirmedAt',profile.confirmed_at);
$$;

create function account_private.confirm_profile(actor uuid,chosen_cat text,chosen_mbti text,origin text)
returns account_private.member_profiles language plpgsql security definer set search_path='' as $$
declare profile account_private.member_profiles;
begin
  if actor is null or chosen_cat is null or chosen_mbti is null
    or not exists(select 1 from modak_private.meow_catalogue where cat_id=chosen_cat)
    or chosen_mbti !~ '^[IE][NS][TF][JP]$' then
    raise exception 'SHARED_PROFILE_INVALID' using errcode='22023';
  end if;
  -- Use MEOW's existing per-user command lock so the first valid confirmation
  -- wins across both app RPCs and legacy MEOW registration, without overwrites.
  perform pg_advisory_xact_lock(hashtextextended(actor::text,71819));
  insert into account_private.member_profiles(user_id,cat_id,mbti,source)
    values(actor,chosen_cat,chosen_mbti,origin) on conflict(user_id) do nothing;
  select * into profile from account_private.member_profiles where user_id=actor;
  if profile.cat_id<>chosen_cat or profile.mbti<>chosen_mbti then
    raise exception 'SHARED_PROFILE_FIXED' using errcode='22023';
  end if;
  return profile;
end;
$$;

create function public.get_shared_profile(expected_actor uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare viewer uuid:=auth.uid(); profile account_private.member_profiles;
begin
  if viewer is null or viewer is distinct from expected_actor or not exists(
    select 1 from auth.users u where u.id=viewer and coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false)=false
  ) then
    raise exception 'SHARED_PROFILE_AUTH_REQUIRED' using errcode='42501';
  end if;
  select * into profile from account_private.member_profiles where user_id=viewer;
  if not found then return null; end if;
  return account_private.profile_json(profile);
end;
$$;

-- "Save" confirms the first selection. Existing MEOW's fixed-identity rule is
-- preserved: an identical retry returns the same record; changes are rejected.
create function public.save_shared_profile(expected_actor uuid,cat_id text,mbti_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare viewer uuid:=auth.uid(); profile account_private.member_profiles;
begin
  if viewer is null or viewer is distinct from expected_actor or not exists(
    select 1 from auth.users u where u.id=viewer and coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false)=false
  ) then
    raise exception 'SHARED_PROFILE_AUTH_REQUIRED' using errcode='42501';
  end if;
  profile:=account_private.confirm_profile(viewer,cat_id,mbti_code,'shared');
  -- Never create/update a MEOW cat, location, consent, social counters or energy.
  return account_private.profile_json(profile);
end;
$$;

-- MEOW's social row is an existing public projection. A legacy MEOW register
-- may create it only through its existing consent flow; it must agree with the
-- one shared identity. This is one-way confirmation, not a syncing write loop.
create function account_private.confirm_from_meow() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform account_private.confirm_profile(new.user_id,new.cat_id,new.mbti,'meow');
  return new;
exception when sqlstate '22023' then
  if sqlerrm='SHARED_PROFILE_FIXED' then raise exception 'MEOW_IDENTITY_FIXED' using errcode='22023'; end if;
  raise;
end;
$$;
create trigger shared_companion_identity after insert or update of cat_id,mbti on modak_private.meow_cats
for each row execute function account_private.confirm_from_meow();

revoke all on function account_private.profile_json(account_private.member_profiles),
  account_private.confirm_profile(uuid,text,text,text),account_private.confirm_from_meow() from public,anon,authenticated,service_role;
revoke all on function public.get_shared_profile(uuid),public.save_shared_profile(uuid,text,text) from public,anon;
grant execute on function public.get_shared_profile(uuid),public.save_shared_profile(uuid,text,text) to authenticated;

commit;
