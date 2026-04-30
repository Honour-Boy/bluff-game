// ============================================================
// SOCKET HANDLERS — All Socket.IO event logic
// ============================================================

const { v4: uuidv4 } = require('uuid');
const engine = require('./gameEngine');

/**
 * In-memory store: roomCode → roomState
 * This is the single source of truth for all game state.
 */
const rooms = new Map();

// ─── Room accessors ───────────────────────────────────────────

async function getRoom(code) {
  return rooms.get(code) || null;
}

async function saveRoom(room) {
  rooms.set(room.code, room);
}

// ─── Broadcast helpers ────────────────────────────────────────

/**
 * In physical mode: broadcast identical serialized state to all room members.
 * In online mode: send personalized state (including myHand) to each connected socket.
 */
async function broadcastRoomState(io, roomCode) {
  const room = await getRoom(roomCode);
  if (!room) return;

  if (room.mode === engine.MODES.ONLINE) {
    const sockets = await io.in(roomCode).fetchSockets();
    for (const s of sockets) {
      // Match socket to a player by socketId
      const player = room.players.find(p => p.socketId === s.id);
      const playerId = player ? player.id : null;
      s.emit('room_state', engine.serializeRoom(room, playerId));
    }
  } else {
    io.to(roomCode).emit('room_state', engine.serializeRoom(room));
  }
}

// ─── Register all handlers ────────────────────────────────────

// Track host disconnect timers per room: roomCode → timeoutId
const hostDisconnectTimers = new Map();

function registerSocketHandlers(io, socket) {
  const disconnectTimers = new Map();

  // ─── HOST: Create a new room ─────────────────────────────
  socket.on('create_room', async ({ username, mode } = {}, callback) => {
    try {
      const roomMode = mode === engine.MODES.ONLINE ? engine.MODES.ONLINE : engine.MODES.PHYSICAL;
      const room = engine.createRoom(socket.id, roomMode);
      room.cardPlayedThisTurn = false;
      room.bluffUsedThisTurn = false;
      await saveRoom(room);

      socket.join(room.code);

      console.log(`[Room ${room.code}] Created by host ${socket.id} (mode: ${roomMode})`);

      callback({ success: true, roomCode: room.code, isHost: true, mode: roomMode });
      await broadcastRoomState(io, room.code);
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Join an existing room ──────────────────────
  socket.on('join_room', async ({ roomCode, username, playerId }, callback) => {
    try {
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.phase !== 'lobby') return callback({ success: false, error: 'Game already started' });
      if (room.players.length >= engine.MAX_PLAYERS) return callback({ success: false, error: 'Room is full' });

      // Username validation — only for new joins (not reconnects)
      const trimmedName = username?.trim() || '';
      const isReconnect = !!(playerId && room.players.find(p => p.id === playerId));
      if (!isReconnect) {
        if (trimmedName.length < 4) {
          return callback({ success: false, error: 'Username must be at least 4 characters' });
        }
        const nameTaken = room.players.some(
          p => p.username.toLowerCase() === trimmedName.toLowerCase()
        );
        if (nameTaken) {
          return callback({ success: false, error: 'That name is already taken. Choose another.' });
        }
      }

      let player = playerId ? room.players.find(p => p.id === playerId) : null;

      if (player) {
        engine.reconnectPlayer(room, player.id, socket.id);
        console.log(`[Room ${code}] Reconnected player ${player.username}`);
      } else {
        const id = uuidv4();
        player = engine.createPlayer(id, username?.trim() || 'Unknown', socket.id);
        room.players.push(player);
        console.log(`[Room ${code}] New player joined: ${player.username}`);
      }

      await saveRoom(room);
      socket.join(code);
      callback({ success: true, playerId: player.id, roomCode: code, mode: room.mode });
      await broadcastRoomState(io, code);
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── HOST: Reconnect to room after refresh ───────────────
  socket.on('host_reconnect', async ({ roomCode }, callback) => {
    try {
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback({ success: false, error: 'Room not found' });

      // Cancel any pending host-disconnect game-over timer
      if (hostDisconnectTimers.has(code)) {
        clearTimeout(hostDisconnectTimers.get(code));
        hostDisconnectTimers.delete(code);
        console.log(`[Room ${code}] Host reconnected — game-over timer cancelled`);
      }

      room.hostSocketId = socket.id;
      await saveRoom(room);
      socket.join(code);

      console.log(`[Room ${code}] Host reconnected`);
      callback({ success: true, isHost: true, mode: room.mode });
      await broadcastRoomState(io, code);
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Reconnect mid-game after refresh ────────────
  socket.on('player_reconnect', async ({ roomCode, playerId }, callback) => {
    try {
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback({ success: false, error: 'Room not found' });

      const player = room.players.find(p => p.id === playerId);
      if (!player) return callback({ success: false, error: 'Player not found' });

      const oldSocketId = player.socketId;
      if (disconnectTimers.has(oldSocketId)) {
        clearTimeout(disconnectTimers.get(oldSocketId));
        disconnectTimers.delete(oldSocketId);
        console.log(`[Room ${code}] Player ${player.username} reconnected — elimination cancelled`);
      }

      engine.reconnectPlayer(room, playerId, socket.id);
      await saveRoom(room);
      socket.join(code);

      console.log(`[Room ${code}] Player ${player.username} reconnected mid-game`);
      callback({ success: true, playerId: player.id, mode: room.mode });
      await broadcastRoomState(io, code);
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── HOST: Start the game ─────────────────────────────────
  socket.on('start_game', async ({ roomCode }, callback) => {
    try {
      const room = await getRoom(roomCode);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.hostSocketId !== socket.id) return callback({ success: false, error: 'Not the host' });

      engine.startGame(room);
      await saveRoom(room);

      console.log(`[Room ${roomCode}] Game started (${room.mode}). Turn order: ${room.turnOrder.join(', ')}`);
      callback({ success: true });
      await broadcastRoomState(io, roomCode);
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── HOST: Advance to next turn (physical only) ──────────
  socket.on('next_turn', async ({ roomCode }, callback) => {
    try {
      const room = await getRoom(roomCode);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.hostSocketId !== socket.id) return callback({ success: false, error: 'Not the host' });
      if (room.phase !== 'playing' && room.phase !== 'round_end') {
        return callback({ success: false, error: 'Cannot advance turn now' });
      }

      engine.advanceTurn(room);

      const gameOverWinner = engine.checkGameOver(room);
      if (gameOverWinner) {
        room.phase = 'game_over';
        room.lastAction = { type: 'game_over', winnerId: gameOverWinner.id, winnerName: gameOverWinner.username };
      }

      await saveRoom(room);
      callback({ success: true });
      await broadcastRoomState(io, roomCode);
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── HOST: Resolve bluff (physical mode) — sets spin_pending ──
  socket.on('resolve_bluff', async ({ roomCode, bluffIsCorrect }, callback) => {
    try {
      const room = await getRoom(roomCode);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.hostSocketId !== socket.id) return callback({ success: false, error: 'Not the host' });

      const currentPlayerId = room.turnOrder[room.currentTurnIndex];
      const currentPlayer = room.players.find(p => p.id === currentPlayerId);

      const prevIdx = (room.currentTurnIndex - 1 + room.turnOrder.length) % room.turnOrder.length;
      const prevPlayerId = room.turnOrder[prevIdx];
      const prevPlayer = room.players.find(p => p.id === prevPlayerId);

      const spinTarget = bluffIsCorrect ? prevPlayer : currentPlayer;

      room.phase = 'spin_pending';
      room.spinTargetId = spinTarget.id;
      room.lastAction = {
        type: 'spin_pending',
        spinTargetId: spinTarget.id,
        spinTargetName: spinTarget.username,
        bluffCorrect: bluffIsCorrect,
      };

      await saveRoom(room);
      console.log(`[Room ${roomCode}] Bluff resolved. ${spinTarget.username} must spin.`);
      await broadcastRoomState(io, roomCode);
      callback({ success: true });
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Pull the trigger (self-initiated spin) ──────
  socket.on('player_spin', async ({ roomCode, playerId }, callback) => {
    try {
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.phase !== 'spin_pending') return callback({ success: false, error: 'No spin pending' });
      if (room.spinTargetId !== playerId) return callback({ success: false, error: 'Not your spin' });

      const player = room.players.find(p => p.id === playerId);
      if (!player) return callback({ success: false, error: 'Player not found' });

      const riskLevelBefore = player.riskLevel;
      const spinResult = engine.spinGun(player);

      if (spinResult.eliminated) {
        engine.eliminateFromTurnOrder(room, player.id);
        engine.newCardType(room);

        // Online mode: survivor draws a card after an elimination
        if (room.mode === engine.MODES.ONLINE) {
          const currentPlayerId = room.turnOrder[room.currentTurnIndex];
          if (currentPlayerId) {
            engine.drawCardForPlayer(room, currentPlayerId);
          }
        }
      }

      room.phase = 'playing';
      room.spinTargetId = null;
      room.cardPlayedThisTurn = false;
      room.bluffUsedThisTurn = true;

      room.lastAction = {
        type: 'spin_result',
        spinTargetId: player.id,
        spinTargetName: player.username,
        roll: spinResult.roll,
        eliminated: spinResult.eliminated,
        riskLevel: spinResult.riskLevel,
        riskLevelBefore,
        ...(spinResult.eliminated ? { newCardType: room.currentCardType } : {}),
      };

      const gameOverWinner = engine.checkGameOver(room);
      if (gameOverWinner) {
        room.phase = 'game_over';
        room.lastAction = { type: 'game_over', winnerId: gameOverWinner.id, winnerName: gameOverWinner.username };
      }

      await saveRoom(room);
      console.log(`[Room ${code}] ${player.username} spun: roll=${spinResult.roll}, eliminated=${spinResult.eliminated}`);
      await broadcastRoomState(io, code);
      callback({ success: true, spinResult });
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── HOST: Declare round winner (physical only) ──────────
  socket.on('round_win', async ({ roomCode, playerId }, callback) => {
    try {
      const room = await getRoom(roomCode);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.hostSocketId !== socket.id) return callback({ success: false, error: 'Not the host' });

      const winner = engine.declareRoundWinner(room, playerId);
      if (!winner) return callback({ success: false, error: 'Player not found' });

      await saveRoom(room);
      callback({ success: true });
      await broadcastRoomState(io, roomCode);
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Call bluff ──────────────────────────────────
  socket.on('call_bluff', async ({ roomCode, playerId }, callback) => {
    try {
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.phase !== 'playing') return callback({ success: false, error: 'Not in playing phase' });

      const currentPlayerId = room.turnOrder[room.currentTurnIndex];
      if (playerId !== currentPlayerId) return callback({ success: false, error: 'Not your turn' });
      if (room.bluffUsedThisTurn) return callback({ success: false, error: 'Bluff already called this turn' });
      if (room.isFirstTurn) return callback({ success: false, error: 'Cannot call bluff on the first turn' });

      room.bluffUsedThisTurn = true;

      if (room.mode === engine.MODES.ONLINE) {
        // Auto-resolve: server reveals the card and decides who spins
        const { bluffIsCorrect, spinTarget, revealedCard, accuser, accused } = engine.resolveBluffOnline(room);

        room.phase = 'spin_pending';
        room.spinTargetId = spinTarget.id;
        room.lastAction = {
          type: 'spin_pending',
          spinTargetId: spinTarget.id,
          spinTargetName: spinTarget.username,
          bluffCorrect: bluffIsCorrect,
          autoResolved: true,
          // Full bluff reveal context so clients can show the result
          accuserId: accuser?.id,
          accuserName: accuser?.username,
          accusedId: accused?.id,
          accusedName: accused?.username,
          revealedCard: revealedCard || null,
        };

        console.log(`[Room ${code}] Online bluff: ${accuser?.username} called on ${accused?.username}, revealed ${revealedCard?.shape ?? 'nothing'}, correct=${bluffIsCorrect}. ${spinTarget.username} spins.`);
      } else {
        // Physical: host resolves manually
        const callerPlayer = room.players.find(p => p.id === playerId);
        room.phase = 'bluff_resolution';
        room.lastAction = {
          type: 'bluff_called',
          callerId: playerId,
          callerName: callerPlayer?.username || null,
        };
      }

      await saveRoom(room);
      await broadcastRoomState(io, code);
      callback({ success: true });
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Play card face-down (physical) ──────────────
  socket.on('play_card', async ({ roomCode, playerId }, callback) => {
    try {
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback({ success: false, error: 'Room not found' });

      const currentPlayerId = room.turnOrder[room.currentTurnIndex];
      if (playerId !== currentPlayerId) return callback({ success: false, error: 'Not your turn' });
      if (room.phase !== 'playing') return callback({ success: false, error: 'Cannot play card now' });
      if (room.mode !== engine.MODES.PHYSICAL) return callback({ success: false, error: 'Use play_card_online in online mode' });

      const physPlayer = room.players.find(p => p.id === playerId);
      room.lastAction = { type: 'card_played', playerId, playerName: physPlayer?.username || null };
      room.cardPlayedThisTurn = true;

      await saveRoom(room);
      await broadcastRoomState(io, code);
      callback({ success: true });
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Play a specific card (online mode) ──────────
  socket.on('play_card_online', async ({ roomCode, playerId, cardId, nominatedShape }, callback) => {
    try {
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.mode !== engine.MODES.ONLINE) return callback({ success: false, error: 'Only in online mode' });

      const currentPlayerId = room.turnOrder[room.currentTurnIndex];
      if (playerId !== currentPlayerId) return callback({ success: false, error: 'Not your turn' });
      if (room.phase !== 'playing') return callback({ success: false, error: 'Cannot play card now' });

      const result = engine.validateAndPlayCard(room, playerId, cardId);
      if (!result.ok) return callback({ success: false, error: result.error });

      // Whot card: player nominates the next required shape.
      // This only takes effect if a valid SHAPES value is provided.
      if (result.card.shape === 'whot' && nominatedShape && engine.SHAPES.includes(nominatedShape)) {
        room.currentCardType = nominatedShape;
      }

      const actingPlayer = room.players.find(p => p.id === playerId);
      room.lastAction = {
        type: 'card_played_online',
        playerId,
        playerName: actingPlayer?.username || null,
        // Card details hidden from broadcast — only visible via spectate or bluff reveal
      };

      await saveRoom(room);
      await broadcastRoomState(io, code);
      callback({ success: true, card: result.card });
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: End turn ────────────────────────────────────
  socket.on('end_turn', async ({ roomCode, playerId }, callback) => {
    try {
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback({ success: false, error: 'Room not found' });

      const currentPlayerId = room.turnOrder[room.currentTurnIndex];
      if (playerId !== currentPlayerId) return callback({ success: false, error: 'Not your turn' });
      if (!room.cardPlayedThisTurn) return callback({ success: false, error: 'Play a card first' });

      // Online mode: check if the player's hand is now empty → round win
      if (room.mode === engine.MODES.ONLINE) {
        const hand = room.hands ? room.hands.get(playerId) : null;
        if (hand && hand.length === 0) {
          engine.declareRoundWinner(room, playerId);
          await saveRoom(room);
          await broadcastRoomState(io, code);
          return callback({ success: true, roundWin: true });
        }
      }

      room.cardPlayedThisTurn = false;
      room.bluffUsedThisTurn = false;
      engine.advanceTurn(room);

      const gameOverWinner = engine.checkGameOver(room);
      if (gameOverWinner) {
        room.phase = 'game_over';
        room.lastAction = { type: 'game_over', winnerId: gameOverWinner.id, winnerName: gameOverWinner.username };
      }

      await saveRoom(room);
      await broadcastRoomState(io, code);
      callback({ success: true });
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── HOST: Start next round (online mode) ───────────────
  socket.on('start_next_round', async ({ roomCode }, callback) => {
    try {
      const room = await getRoom(roomCode);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.hostSocketId !== socket.id) return callback({ success: false, error: 'Not the host' });
      if (room.mode !== engine.MODES.ONLINE) return callback({ success: false, error: 'Only in online mode' });
      if (room.phase !== 'round_end') return callback({ success: false, error: 'Not in round_end phase' });

      engine.resetRoundOnline(room);

      const gameOverWinner = engine.checkGameOver(room);
      if (gameOverWinner) {
        room.phase = 'game_over';
        room.lastAction = { type: 'game_over', winnerId: gameOverWinner.id, winnerName: gameOverWinner.username };
      }

      await saveRoom(room);
      console.log(`[Room ${roomCode}] Round ${room.roundNumber} started (online)`);
      callback({ success: true });
      await broadcastRoomState(io, roomCode);
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── HOST: Spectate a player's hand (online mode) ───────
  socket.on('spectate_player', async ({ roomCode, targetPlayerId }, callback) => {
    try {
      const room = await getRoom(roomCode);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.hostSocketId !== socket.id) return callback({ success: false, error: 'Not the host' });
      if (room.mode !== engine.MODES.ONLINE) return callback({ success: false, error: 'Only in online mode' });

      const hand = room.hands ? room.hands.get(targetPlayerId) : null;
      if (!hand) return callback({ success: false, error: 'Player has no hand' });

      callback({ success: true, hand });
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Acknowledge spin result (synced overlay dismiss) ───
  // When the spin target clicks Continue, broadcast to all room members
  // so every client can dismiss their spin overlay simultaneously.
  socket.on('spin_acknowledged', async ({ roomCode } = {}) => {
    const code = roomCode?.toUpperCase();
    if (code) io.to(code).emit('spin_acknowledged');
  });

  // ─── PLAYER: Intentional leave ───────────────────────────
  // Emitted by the client on beforeunload so the server cleans up immediately
  // without waiting for the 30-second grace period.
  socket.on('leave_room', async ({ roomCode, playerId } = {}) => {
    try {
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return;

      // Cancel any pending grace-period timer for this socket
      if (disconnectTimers.has(socket.id)) {
        clearTimeout(disconnectTimers.get(socket.id));
        disconnectTimers.delete(socket.id);
      }

      // Remove player from players array entirely (not just mark eliminated)
      const idx = room.players.findIndex(p => p.id === playerId);
      if (idx !== -1) {
        const player = room.players[idx];
        room.players.splice(idx, 1);
        engine.eliminateFromTurnOrder(room, playerId);
        console.log(`[Room ${code}] Player ${player.username} left intentionally`);

        const gameOverWinner = engine.checkGameOver(room);
        if (gameOverWinner) {
          room.phase = 'game_over';
          room.lastAction = { type: 'game_over', winnerId: gameOverWinner.id, winnerName: gameOverWinner.username };
        }

        await saveRoom(room);
        socket.leave(code);
        await broadcastRoomState(io, code);
      }
    } catch (err) {
      console.error('[leave_room] error:', err.message);
    }
  });

  // ─── DISCONNECT ──────────────────────────────────────────
  socket.on('disconnect', async () => {
    console.log(`[Socket] Disconnected: ${socket.id}`);

    for (const [code, room] of rooms.entries()) {
      // ── Host disconnected ──
      if (room.hostSocketId === socket.id) {
        console.log(`[Room ${code}] Host disconnected — 10s grace period before game ends`);
        io.to(code).emit('host_disconnecting', { countdown: 10 });

        const timer = setTimeout(() => {
          // Host never reconnected — end the game for everyone
          io.to(code).emit('game_ended', { reason: 'The host left the game.' });
          rooms.delete(code);
          hostDisconnectTimers.delete(code);
          console.log(`[Room ${code}] Host grace period expired — room deleted`);
        }, 10000);

        hostDisconnectTimers.set(code, timer);
        continue;
      }

      const player = room.players.find(p => p.socketId === socket.id);
      if (!player || player.status === 'eliminated') continue;

      // ── Player disconnected in lobby — remove immediately, no grace period ──
      if (room.phase === 'lobby') {
        const idx = room.players.findIndex(p => p.id === player.id);
        if (idx !== -1) room.players.splice(idx, 1);
        console.log(`[Room ${code}] Player ${player.username} disconnected from lobby — removed`);
        await saveRoom(room);
        await broadcastRoomState(io, code);
        continue;
      }

      // ── Player disconnected mid-game — 30s grace period ──
      if (room.phase === 'playing' || room.phase === 'bluff_resolution' || room.phase === 'spin_pending') {
        console.log(`[Room ${code}] Player ${player.username} disconnected — starting 30s grace period`);

        io.to(code).emit('player_disconnecting', { playerId: player.id, playerName: player.username });

        const timer = setTimeout(async () => {
          const stillDisconnected = room.players.find(p => p.id === player.id && p.socketId === socket.id);
          if (stillDisconnected && stillDisconnected.status === 'alive') {
            const eliminated = engine.handleDisconnect(room, socket.id);
            if (eliminated) {
              console.log(`[Room ${code}] Player ${eliminated.username} grace period expired → eliminated`);
              room.lastAction = { type: 'disconnected', playerId: eliminated.id, playerName: eliminated.username };

              // Auto-end game if only one player remains after disconnect
              const gameOverWinner = engine.checkGameOver(room);
              if (gameOverWinner) {
                room.phase = 'game_over';
                room.lastAction = { type: 'game_over', winnerId: gameOverWinner.id, winnerName: gameOverWinner.username };
              }

              await saveRoom(room);
              await broadcastRoomState(io, code);
            }
          }
          disconnectTimers.delete(socket.id);
        }, 30000);

        disconnectTimers.set(socket.id, timer);
      }
    }
  });
}

module.exports = { registerSocketHandlers, rooms };
