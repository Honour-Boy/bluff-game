import { useEffect } from 'react';

export function usePromptEvents({
  socket,
  roomPhase,
  medicPrompt,
  sniperPrompt,
  setMedicPrompt,
  setSniperPrompt,
  setBloodDebtPrompt,
}) {
  useEffect(() => {
    const onMedicSavePending = (payload) => {
      setMedicPrompt(payload || null);
    };
    const onSniperRedirectPending = (payload) => {
      setSniperPrompt(payload || null);
    };
    // Covenant — private prompt to the just-eliminated player to name their
    // blood-debt target. The overlay self-dismisses on its own countdown (and
    // on pick), so no phase-based teardown is needed here.
    const onBloodDebtAssign = (payload) => {
      setBloodDebtPrompt?.(payload || null);
    };

    socket.on('medic_save_pending', onMedicSavePending);
    socket.on('sniper_redirect_pending', onSniperRedirectPending);
    socket.on('blood_debt_assign', onBloodDebtAssign);
    return () => {
      socket.off('medic_save_pending', onMedicSavePending);
      socket.off('sniper_redirect_pending', onSniperRedirectPending);
      socket.off('blood_debt_assign', onBloodDebtAssign);
    };
  }, [setMedicPrompt, setSniperPrompt, setBloodDebtPrompt, socket]);

  useEffect(() => {
    if (roomPhase !== 'medic_pending' && medicPrompt) setMedicPrompt(null);
    if (roomPhase !== 'sniper_pending' && sniperPrompt) setSniperPrompt(null);
  }, [medicPrompt, roomPhase, setMedicPrompt, setSniperPrompt, sniperPrompt]);
}

// ─── Pre-game selection & role reveal (#116) ──────────────────
// The serialized `pregame` block on room_state is the authoritative,
// reconnect-safe source — it's mirrored directly into local state and
// drives the reveal/selection UI. The transient events layer on top for
// immediacy (acting on them avoids a frame of room_state lag and tears
// the modal down the instant the round resolves).
export function usePreGameEvents({ socket, roomPhase, serializedPregame, setPregame }) {
  useEffect(() => {
    if (roomPhase === 'pre_game') setPregame(serializedPregame || null);
    else setPregame(null);
  }, [roomPhase, serializedPregame, setPregame]);

  useEffect(() => {
    const onSelectionStart = (payload) => {
      setPregame((prev) => ({
        ...(prev || {}),
        selectionOpen: true,
        myPool: payload?.pool ?? prev?.myPool ?? null,
        deadline: payload?.deadline ?? prev?.deadline ?? null,
      }));
    };
    const onWaiting = (payload) => {
      setPregame((prev) => (prev
        ? {
            ...prev,
            pendingCount: payload?.pendingCount ?? prev.pendingCount,
            totalCount: payload?.totalCount ?? prev.totalCount,
          }
        : prev));
    };
    const onComplete = () => setPregame(null);

    socket.on('pre_game_selection_start', onSelectionStart);
    socket.on('pre_game_waiting', onWaiting);
    socket.on('pre_game_complete', onComplete);
    return () => {
      socket.off('pre_game_selection_start', onSelectionStart);
      socket.off('pre_game_waiting', onWaiting);
      socket.off('pre_game_complete', onComplete);
    };
  }, [setPregame, socket]);
}
