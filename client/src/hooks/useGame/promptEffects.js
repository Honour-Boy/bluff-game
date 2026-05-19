import { useEffect } from 'react';

export function usePromptEvents({
  socket,
  roomPhase,
  medicPrompt,
  sniperPrompt,
  setMedicPrompt,
  setSniperPrompt,
}) {
  useEffect(() => {
    const onMedicSavePending = (payload) => {
      setMedicPrompt(payload || null);
    };
    const onSniperRedirectPending = (payload) => {
      setSniperPrompt(payload || null);
    };

    socket.on('medic_save_pending', onMedicSavePending);
    socket.on('sniper_redirect_pending', onSniperRedirectPending);
    return () => {
      socket.off('medic_save_pending', onMedicSavePending);
      socket.off('sniper_redirect_pending', onSniperRedirectPending);
    };
  }, [setMedicPrompt, setSniperPrompt, socket]);

  useEffect(() => {
    if (roomPhase !== 'medic_pending' && medicPrompt) setMedicPrompt(null);
    if (roomPhase !== 'sniper_pending' && sniperPrompt) setSniperPrompt(null);
  }, [medicPrompt, roomPhase, setMedicPrompt, setSniperPrompt, sniperPrompt]);
}
