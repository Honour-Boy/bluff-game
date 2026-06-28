-- One-time reset for the controlled user test.
-- Everyone starts the test fresh so the new career-stat tally is clean: level 1,
-- 0 XP, 0 games, all lifetime stats zeroed, and equipped cosmetics back to slot
-- defaults (higher-tier skins re-lock until re-earned — the server already
-- downgrades locked items on read, but this makes the reset explicit).
--
-- Tracked migration → runs exactly once against the remote. Safe to ship: on a
-- fresh database it touches no rows.
update public.player_progression
set xp = 0,
    games_played = 0,
    wins = 0,
    spins_survived = 0,
    correct_bluff_calls = 0,
    bluffs_defended = 0,
    players_eliminated = 0,
    power_cards_resolved = 0,
    last_stand_wins = 0,
    equipped = '{}'::jsonb,
    updated_at = now();
