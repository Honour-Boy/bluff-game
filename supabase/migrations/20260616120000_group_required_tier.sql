-- Phase 6 (Progression & Covenant) - Group Room Tier Gating, G1.
--
-- A group is bound to exactly one progression tier (the creator's tier at
-- creation). Every member must match that tier; the persistent group room is
-- built with room.tier = groups.required_tier (NOT the live host's tier),
-- closing the Phase 2 gap where group rooms bypassed the tier caps.
--
-- The tier is derived at runtime from XP everywhere else in the app; this
-- column persists the group's *binding* so it survives owner promotion (XP
-- only rises, so an owner can outgrow the group - handled by the owner
-- mismatch resolution in G5, not by mutating this column automatically).

alter table public.groups
  add column if not exists required_tier text not null default 'streets'
  check (required_tier in ('streets', 'backroads', 'syndicate', 'covenant'));

-- R-G1 - backfill from the *owner's* current tier rather than a flat
-- 'streets', so existing higher-tier crews aren't locked out of their own
-- group on the next entry. Tier thresholds mirror engine/progression.js
-- LEVEL_XP_THRESHOLDS: level 3 (Backroads) = 350 XP, level 9 (Syndicate) =
-- 3800 XP, level 14 (Covenant) = 11500 XP.
update public.groups g
set required_tier = case
  when coalesce(pp.xp, 0) >= 11500 then 'covenant'
  when coalesce(pp.xp, 0) >= 3800  then 'syndicate'
  when coalesce(pp.xp, 0) >= 350   then 'backroads'
  else 'streets'
end
from public.groups g2
left join public.player_progression pp
  on pp.user_id = coalesce(g2.owner_user_id, g2.host_user_id)
where g2.id = g.id
  and g.deleted_at is null;
