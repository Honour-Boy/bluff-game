// ============================================================
// SOCKET HANDLERS — All Socket.IO event logic
// ============================================================

const { createClient } = require('@supabase/supabase-js');
const engine = require('./gameEngine');

// ─── Supabase admin client (server-side only) ─────────────────
// Used to verify JWT tokens and look up profiles.
// Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env vars.
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

/**
 * In-memory store: roomCode → roomState
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

async function broadcastRoomState(io, roomCode) {
  const room = await getRoom(roomCode);
  if (!room) return;

  if (room.mode === engine.MODES.ONLINE) {
    const sockets = await io.in(roomCode).fetchSockets();
    for (const s of sockets) {
      const player = room.players.find(p => p.socketId === s.id);
      const playerId = player ? player.id : null;
      s.emit('room_state', engine.serializeRoom(room, playerId));
    }
  } else {
    io.to(roomCode).emit('room_state', engine.serializeRoom(room));
  }
}

// ─── Register all handlers ────────────────────────────────────

const hostDisconnectTimers = new Map();

function registerSocketHandlers(io, socket) {
  const disconnectTimers = new Map();

  // ─── AUTHENTICATE socket with Supabase JWT ───────────────
  // Must be called once after connecting, before any game events.
  socket.on('authenticate', async ({ token } = {}, callback) => {
    if (!token) return callback?.({ success: false, error: 'No token provided' });

    try {
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data?.user) {
        return callback?.({ success: false, error: 'Invalid or expired token' });
      }

      // Fetch display username from profiles table
      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', data.user.id)
        .single();

      socket.userId   = data.user.id;
      socket.username = profile?.username
        || data.user.user_metadata?.username
        || data.user.user_metadata?.full_name
        || data.user.email?.split('@')[0]
        || 'Player';

      callback?.({ success: true });
    } catch (err) {
      callback?.({ success: false, error: 'Authentication failed' });
    }
  });

  // ─── HOST: Create a new room ─────────────────────────────
  socket.on('create_room', async ({ mode } = {}, callback) => {
    if (!socket.userId) return callback({ success: false, error: 'Not authenticated' });

    try {
      const roomMode = mode === engine.MODES.ONLINE ? engine.MODES.ONLINE : engine.MODES.PHYSICAL;
      const room = engine.createRoom(socket.id, roomMode);
      room.hostUserId = socket.userId;
      room.cardPlayedThisTurn = false;
      room.bluffUsedThisTurn = false;
      await saveRoom(room);

      socket.join(room.code);
      console.log(`[Room ${room.code}] Created by ${socket.username} (mode: ${roomMode})`);

      // In online mode, auto-join host as a player
      if (roomMode === engine.MODES.ONLINE) {
        const player = engine.createPlayer(socket.userId, socket.username, socket.id);
        room.players.push(player);
        await saveRoom(room);
        callback({ success: true, roomCode: room.code, isHost: true, mode: roomMode, playerId: socket.userId });
      } else {
        callback({ success: true, roomCode: room.code, isHost: true, mode: roomMode });
      }

      await broadcastRoomState(io, room.code);
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Join an existing room ──────────────────────
  socket.on('join_room', async ({ roomCode } = {}, callback) => {
    if (!socket.userId) return callback({ success: false, error: 'Not authenticated' });

    try {
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.phase !== 'lobby') return callback({ success: false, error: 'Game already started' });
      if (room.players.length >= engine.MAX_PLAYERS) return callback({ success: false, error: 'Room is full' });

      // Reconnect if already in room
      let player = room.players.find(p => p.id === socket.userId);
      if (player) {
        engine.reconnectPlayer(room, player.id, socket.id);
        console.log(`[Room ${code}] Reconnected: ${player.username}`);
      } else {
        // Duplicate name check (case-insensitive)
        const nameTaken = room.players.some(
          p => p.username.toLowerCase() === socket.username.toLowerCase()
        );
        if (nameTaken) {
          return callback({ success: false, error: 'That name is already taken in this room.' });
        }
        player = engine.createPlayer(socket.userId, socket.username, socket.id);
        room.players.push(player);
        console.log(`[Room ${code}] Joined: ${player.username}`);
      }

      await saveRoom(room);
      socket.join(code);
      callback({ success: true, playerId: player.id, roomCode: code, mode: room.mode });
      await broadcastRoomState(io, code);
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── HOST: Reconnect after refresh ──────────────────────
  socket.on('host_reconnect', async ({ roomCode } = {}, callback) => {
    try {
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback({ success: false, error: 'Room not found' });

      if (hostDisconnectTimers.has(code)) {
        clearTimeout(hostDisconnectTimers.get(code));
        hostDisconnectTimers.delete(code);
      }

      room.hostSocketId = socket.id;
      await saveRoom(room);
      socket.join(code);
      callback({ success: true, isHost: true, mode: room.mode });
      await broadcastRoomState(io, code);
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Reconnect mid-game ──────────────────────────
  socket.on('player_reconnect', async ({ roomCode } = {}, callback) => {
    if (!socket.userId) return callback({ success: false, error: 'Not authenticated' });

    try {
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback({ success: false, error: 'Room not found' });

      const player = room.players.find(p => p.id === socket.userId);
      if (!player) return callback({ success: false, error: 'Player not found' });

      const oldSocketId = player.socketId;
      if (disconnectTimers.has(oldSocketId)) {
        clearTimeout(disconnectTimers.get(oldSocketId));
        disconnectTimers.delete(oldSocketId);
      }

      engine.reconnectPlayer(room, socket.userId, socket.id);
      await saveRoom(room);
      socket.join(code);
      callback({ success: true, playerId: player.id, mode: room.mode });
      await broadcastRoomState(io, code);
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── HOST: Start the game ─────────────────────────────────
  socket.on('start_game', async ({ roomCode } = {}, callback) => {
    try {
      const room = await getRoom(roomCode);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.hostSocketId !== socket.id) return callback({ success: false, error: 'Not the host' });

      engine.startGame(room);
      await saveRoom(room);
      callback({ success: true });
      await broadcastRoomState(io, roomCode);
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── HOST: Next turn (physical) ──────────────────────────
  socket.on('next_turn', async ({ roomCode } = {}, callback) => {
    try {
      const room = await getRoom(roomCode);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.hostSocketId !== socket.id) return callback({ success: false, error: 'Not the host' });

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

  // ─── HOST: Resolve bluff (physical) ─────────────────────
  socket.on('resolve_bluff', async ({ roomCode, bluffIsCorrect } = {}, callback) => {
    try {
      const room = await getRoom(roomCode);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.hostSocketId !== socket.id) return callback({ success: false, error: 'Not the host' });

      const currentPlayerId = room.turnOrder[room.currentTurnIndex];
      const currentPlayer = room.players.find(p => p.id === currentPlayerId);

      const prevIdx = (room.currentTurnIndex - 1 + room.turnOrder.length) % room.turnOrder.length;
      const prevPlayer = room.players.find(p => p.id === room.turnOrder[prevIdx]);

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
      await broadcastRoomState(io, roomCode);
      callback({ success: true });
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Pull the trigger ────────────────────────────
  socket.on('player_spin', async ({ roomCode, playerId } = {}, callback) => {
    try {
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.phase !== 'spin_pending') return callback({ success: false, error: 'No spin pending' });
      if (room.spinTargetId !== playerId) return callback({ success: false, error: 'Not your spin' });

      const player = room.players.find(p => p.id === playerId);
      if (!player) return callback({ success: false, error: 'Player not found' });

      const riskLevelBefore = player.riskLevel;
      const chamberBefore = [...player.chamber]; // snapshot BEFORE spin mutates it
      const spinResult = engine.spinGun(player);

      if (spinResult.eliminated) {
        engine.eliminateFromTurnOrder(room, player.id);
        engine.newCardType(room);

        if (room.mode === engine.MODES.ONLINE) {
          const currentPlayerId = room.turnOrder[room.currentTurnIndex];
          if (currentPlayerId) engine.drawCardForPlayer(room, currentPlayerId);
        }
      }

      room.phase = 'playing';
      room.spinTargetId = null;
      room.cardPlayedThisTurn = false;
      room.bluffUsedThisTurn = true;

      // spinIndex + chamber are now the authoritative result — no frontend randomness
      room.lastAction = {
        type: 'spin_result',
        spinTargetId: player.id,
        spinTargetName: player.username,
        spinIndex: spinResult.spinIndex,
        chamber: chamberBefore,        // ← pre-spin chamber for animation
        chamberAfter: spinResult.chamber, // ← post-spin chamber (has new bullet on survival)
        roll: spinResult.spinIndex,
        eliminated: spinResult.eliminated,
        riskLevel: spinResult.riskLevel,
        riskLevelBefore,
        ...(spinResult.eliminated ? { newCardType: room.currentCardType } : {}),
      };

      // If this spin ended the game, hold the transition until the
      // overlay is acknowledged — overwriting lastAction here would
      // hide the spin animation from clients (they gate the overlay
      // on lastAction.type === 'spin_result'). The transition runs
      // in the spin_acknowledged handler.
      const gameOverWinner = engine.checkGameOver(room);
      if (gameOverWinner) {
        room.pendingGameOver = { id: gameOverWinner.id, name: gameOverWinner.username };
      }

      await saveRoom(room);
      console.log(`[Room ${code}] ${player.username} spun slot ${spinResult.spinIndex} → ${spinResult.eliminated ? 'ELIMINATED' : 'survived'}`);
      await broadcastRoomState(io, code);
      callback({ success: true, spinResult });
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── HOST: Declare round winner (physical) ───────────────
  socket.on('round_win', async ({ roomCode, playerId } = {}, callback) => {
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
  socket.on('call_bluff', async ({ roomCode, playerId } = {}, callback) => {
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
      const callerPlayer = room.players.find(p => p.id === playerId);

      if (room.mode === engine.MODES.ONLINE) {
        const { bluffIsCorrect, spinTarget, revealedCard, accuser, accused } = engine.resolveBluffOnline(room);

        room.phase = 'spin_pending';
        room.spinTargetId = spinTarget.id;
        room.lastAction = {
          type: 'spin_pending',
          spinTargetId: spinTarget.id,
          spinTargetName: spinTarget.username,
          bluffCorrect: bluffIsCorrect,
          autoResolved: true,
          accuserId: accuser?.id,
          accuserName: accuser?.username,
          accusedId: accused?.id,
          accusedName: accused?.username,
          revealedCard: revealedCard || null,
        };
      } else {
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
  socket.on('play_card', async ({ roomCode, playerId } = {}, callback) => {
    try {
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.turnOrder[room.currentTurnIndex] !== playerId) return callback({ success: false, error: 'Not your turn' });
      if (room.phase !== 'playing') return callback({ success: false, error: 'Cannot play card now' });
      if (room.mode !== engine.MODES.PHYSICAL) return callback({ success: false, error: 'Use play_card_online' });

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

  // ─── PLAYER: Play specific card (online) ─────────────────
  socket.on('play_card_online', async ({ roomCode, playerId, cardId, nominatedShape } = {}, callback) => {
    try {
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.mode !== engine.MODES.ONLINE) return callback({ success: false, error: 'Online mode only' });
      if (room.turnOrder[room.currentTurnIndex] !== playerId) return callback({ success: false, error: 'Not your turn' });
      if (room.phase !== 'playing') return callback({ success: false, error: 'Cannot play card now' });

      const result = engine.validateAndPlayCard(room, playerId, cardId);
      if (!result.ok) return callback({ success: false, error: result.error });

      if (result.card.shape === 'whot' && nominatedShape && engine.SHAPES.includes(nominatedShape)) {
        room.currentCardType = nominatedShape;
      }

      const actingPlayer = room.players.find(p => p.id === playerId);
      room.lastAction = {
        type: 'card_played_online',
        playerId,
        playerName: actingPlayer?.username || null,
      };

      await saveRoom(room);
      await broadcastRoomState(io, code);
      callback({ success: true, card: result.card });
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: End turn ────────────────────────────────────
  socket.on('end_turn', async ({ roomCode, playerId } = {}, callback) => {
    try {
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.turnOrder[room.currentTurnIndex] !== playerId) return callback({ success: false, error: 'Not your turn' });
      if (!room.cardPlayedThisTurn) return callback({ success: false, error: 'Play a card first' });

      if (room.mode === engine.MODES.ONLINE) {
        const hand = room.hands?.get(playerId);
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

  // ─── HOST: Start next round (online) ─────────────────────
  socket.on('start_next_round', async ({ roomCode } = {}, callback) => {
    try {
      const room = await getRoom(roomCode);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.hostSocketId !== socket.id) return callback({ success: false, error: 'Not the host' });
      if (room.mode !== engine.MODES.ONLINE) return callback({ success: false, error: 'Online mode only' });
      if (room.phase !== 'round_end') return callback({ success: false, error: 'Not in round_end phase' });

      engine.resetRoundOnline(room);

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

  // ─── HOST: Spectate a player's hand ─────────────────────
  socket.on('spectate_player', async ({ roomCode, targetPlayerId } = {}, callback) => {
    try {
      const room = await getRoom(roomCode);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.hostSocketId !== socket.id) return callback({ success: false, error: 'Not the host' });

      const hand = room.hands?.get(targetPlayerId);
      if (!hand) return callback({ success: false, error: 'Player has no hand' });
      callback({ success: true, hand });
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── Spin result acknowledgement (synced overlay dismiss) ─
  // Also where a game-ending spin transitions into the game_over
  // phase — we hold that transition in player_spin so clients get
  // to see the eliminating spin animation first.
  socket.on('spin_acknowledged', async ({ roomCode } = {}) => {
    const code = roomCode?.toUpperCase();
    if (!code) return;

    const room = await getRoom(code);
    if (room?.pendingGameOver) {
      const { id, name } = room.pendingGameOver;
      room.phase = 'game_over';
      room.lastAction = { type: 'game_over', winnerId: id, winnerName: name };
      delete room.pendingGameOver;
      await saveRoom(room);
      io.to(code).emit('spin_acknowledged');
      await broadcastRoomState(io, code);
      return;
    }

    io.to(code).emit('spin_acknowledged');
  });

  // ─── Intentional leave ───────────────────────────────────
  socket.on('leave_room', async ({ roomCode, playerId } = {}) => {
    try {
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return;

      if (disconnectTimers.has(socket.id)) {
        clearTimeout(disconnectTimers.get(socket.id));
        disconnectTimers.delete(socket.id);
      }

      const idx = room.players.findIndex(p => p.id === playerId);
      if (idx !== -1) {
        const player = room.players[idx];
        room.players.splice(idx, 1);
        engine.eliminateFromTurnOrder(room, playerId);
        console.log(`[Room ${code}] ${player.username} left`);

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
      console.error('[leave_room]', err.message);
    }
  });

  // ─── Disconnect ──────────────────────────────────────────
  socket.on('disconnect', async () => {
    console.log(`[Socket] Disconnected: ${socket.id}`);

    for (const [code, room] of rooms.entries()) {
      if (room.hostSocketId === socket.id) {
        io.to(code).emit('host_disconnecting', { countdown: 10 });
        const timer = setTimeout(() => {
          io.to(code).emit('game_ended', { reason: 'The host left the game.' });
          rooms.delete(code);
          hostDisconnectTimers.delete(code);
        }, 10000);
        hostDisconnectTimers.set(code, timer);
        continue;
      }

      const player = room.players.find(p => p.socketId === socket.id);
      if (!player || player.status === 'eliminated') continue;

      if (room.phase === 'lobby') {
        const idx = room.players.findIndex(p => p.id === player.id);
        if (idx !== -1) room.players.splice(idx, 1);
        await saveRoom(room);
        await broadcastRoomState(io, code);
        continue;
      }

      if (['playing', 'bluff_resolution', 'spin_pending'].includes(room.phase)) {
        io.to(code).emit('player_disconnecting', { playerId: player.id, playerName: player.username });

        const timer = setTimeout(async () => {
          const still = room.players.find(p => p.id === player.id && p.socketId === socket.id);
          if (still?.status === 'alive') {
            const eliminated = engine.handleDisconnect(room, socket.id);
            if (eliminated) {
              room.lastAction = { type: 'disconnected', playerId: eliminated.id, playerName: eliminated.username };
              const winner = engine.checkGameOver(room);
              if (winner) {
                room.phase = 'game_over';
                room.lastAction = { type: 'game_over', winnerId: winner.id, winnerName: winner.username };
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
