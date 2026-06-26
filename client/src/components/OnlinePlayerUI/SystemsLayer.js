import {
  BettingPopup,
  BettingWaitOverlay,
  GhostVotePopup,
  GhostVoteWaitOverlay,
  LastStandCinematic,
} from '../SystemsOverlays';

export function SystemsLayer({
  roomState,
  myPlayer,
  bettingBusy,
  setBettingBusy,
  placeBet,
  ghostVotingBusy,
  setGhostVotingBusy,
  ghostVote,
  lastStandSpinBusy,
  setLastStandSpinBusy,
  lastStandSpin,
}) {
  const betting = roomState?.betting;
  const ghostVoteState = roomState?.ghostVote;
  const lastStand = roomState?.lastStand;

  return (
    <>
      {betting && (() => {
        if (myPlayer?.id === betting.spinTargetId) {
          return <BettingWaitOverlay closesAt={betting.closesAt} />;
        }
        if (!betting.eligibleIds?.includes(myPlayer?.id)) return null;
        return (
          <BettingPopup
            betting={betting}
            players={roomState?.players}
            myBet={betting.myBet}
            onBet={async (prediction) => {
              if (bettingBusy) return;
              setBettingBusy(true);
              try {
                await placeBet?.(prediction);
              } finally {
                setBettingBusy(false);
              }
            }}
          />
        );
      })()}

      {ghostVoteState && (
        ghostVoteState.amGhostVoter ? (
          <GhostVotePopup
            ghostVote={ghostVoteState}
            myVote={ghostVoteState.myVote}
            onVote={async (option) => {
              if (ghostVotingBusy) return;
              setGhostVotingBusy(true);
              try {
                await ghostVote?.(option);
              } finally {
                setGhostVotingBusy(false);
              }
            }}
          />
        ) : (
          <GhostVoteWaitOverlay closesAt={ghostVoteState.closesAt} />
        )
      )}

      {roomState?.phase === 'last_stand' && lastStand && (
        <LastStandCinematic
          lastStand={lastStand}
          players={roomState.players}
          myPlayerId={myPlayer?.id}
          spinPending={lastStandSpinBusy}
          onSpin={async () => {
            if (lastStandSpinBusy) return;
            setLastStandSpinBusy(true);
            try {
              await lastStandSpin?.();
            } finally {
              setLastStandSpinBusy(false);
            }
          }}
        />
      )}
    </>
  );
}
