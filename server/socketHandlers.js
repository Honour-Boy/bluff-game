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

/**
 * Emit updated room state to all clients in the room
 */
function broadcastRoomState(io, roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  io.to(roomCode).emit('room_state', engine.serializeRoom(room));
}

/**
 * Register all socket events for a connected socket
 */
function registerSocketHandlers(io, socket) {
  const disconnectTimers = new Map();

  // ─── HOST: Create a new room ─────────────────────────────
  socket.on('create_room', ({ username }, callback) => {
    try {
      const room = engine.createRoom(socket.id);
      room.cardPlayedThisTurn = false;
      room.bluffUsedThisTurn = false;
      rooms.set(room.code, room);

      socket.join(room.code);

      console.log(`[Room ${room.code}] Created by host ${socket.id}`);

      callback({ success: true, roomCode: room.code, isHost: true });
      broadcastRoomState(io, room.code);
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Join an existing room ──────────────────────
  socket.on('join_room', ({ roomCode, username, playerId }, callback) => {
    try {
      const room = rooms.get(roomCode?.toUpperCase());
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.phase !== 'lobby') return callback({ success: false, error: 'Game already started' });
      if (room.players.length >= engine.MAX_PLAYERS) return callback({ success: false, error: 'Room is full' });

      // Reconnect: if playerId exists and matches a player, restore them
      let player = playerId ? room.players.find(p => p.id === playerId) : null;

      if (player) {
        // Reconnect existing player
        engine.reconnectPlayer(room, player.id, socket.id);
        console.log(`[Room ${roomCode}] Reconnected player ${player.username}`);
      } else {
        // New player
        const id = uuidv4();
        player = engine.createPlayer(id, username?.trim() || 'Unknown', socket.id);
        room.players.push(player);
        console.log(`[Room ${roomCode}] New player joined: ${player.username}`);
      }

      socket.join(roomCode.toUpperCase());
      callback({ success: true, playerId: player.id, roomCode: roomCode.toUpperCase() });
      broadcastRoomState(io, roomCode.toUpperCase());
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── HOST: Reconnect to room after refresh ───────────────
  socket.on('host_reconnect', ({ roomCode }, callback) => {
    try {
      const room = rooms.get(roomCode?.toUpperCase());
      if (!room) return callback({ success: false, error: 'Room not found' });

      // Update host socket
      room.hostSocketId = socket.id;
      socket.join(roomCode.toUpperCase());

      console.log(`[Room ${roomCode}] Host reconnected`);
      callback({ success: true, isHost: true });
      broadcastRoomState(io, roomCode.toUpperCase());
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Reconnect mid-game after refresh ────────────
  socket.on('player_reconnect', ({ roomCode, playerId }, callback) => {
    try {
      const code = roomCode?.toUpperCase();
      const room = rooms.get(code);
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
      socket.join(code);

      console.log(`[Room ${code}] Player ${player.username} reconnected mid-game`);
      callback({ success: true, playerId: player.id });
      broadcastRoomState(io, code);
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── HOST: Start the game ─────────────────────────────────
  socket.on('start_game', ({ roomCode }, callback) => {
    try {
      const room = rooms.get(roomCode);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.hostSocketId !== socket.id) return callback({ success: false, error: 'Not the host' });

      engine.startGame(room);

      console.log(`[Room ${roomCode}] Game started. Turn order: ${room.turnOrder.join(', ')}`);
      callback({ success: true });
      broadcastRoomState(io, roomCode);
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── HOST: Advance to next turn ───────────────────────────
  socket.on('next_turn', ({ roomCode }, callback) => {
    try {
      const room = rooms.get(roomCode);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.hostSocketId !== socket.id) return callback({ success: false, error: 'Not the host' });
      if (room.phase !== 'playing' && room.phase !== 'round_end') {
        return callback({ success: false, error: 'Cannot advance turn now' });
      }

      engine.advanceTurn(room);

      // Check game over
      const gameOverWinner = engine.checkGameOver(room);
      if (gameOverWinner) {
        room.phase = 'game_over';
        room.lastAction = { type: 'game_over', winnerId: gameOverWinner.id, winnerName: gameOverWinner.username };
      }

      callback({ success: true });
      broadcastRoomState(io, roomCode);
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // (trigger_spin removed — spin is now player-initiated via player_spin)

  // ─── HOST: Resolve bluff — sets spin_pending, player spins themselves ──
  socket.on('resolve_bluff', ({ roomCode, bluffIsCorrect }, callback) => {
    try {
      const room = rooms.get(roomCode);
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

      console.log(`[Room ${roomCode}] Bluff resolved. ${spinTarget.username} must spin.`);
      broadcastRoomState(io, roomCode);
      callback({ success: true });
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Pull the trigger (self-initiated spin) ──────
  socket.on('player_spin', ({ roomCode, playerId }, callback) => {
    try {
      const room = rooms.get(roomCode?.toUpperCase());
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

      console.log(`[Room ${roomCode}] ${player.username} spun: roll=${spinResult.roll}, eliminated=${spinResult.eliminated}`);
      broadcastRoomState(io, roomCode.toUpperCase());
      callback({ success: true, spinResult });
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── HOST: Declare round winner ──────────────────────────
  socket.on('round_win', ({ roomCode, playerId }, callback) => {
    try {
      const room = rooms.get(roomCode);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.hostSocketId !== socket.id) return callback({ success: false, error: 'Not the host' });

      const winner = engine.declareRoundWinner(room, playerId);
      if (!winner) return callback({ success: false, error: 'Player not found' });

      callback({ success: true });
      broadcastRoomState(io, roomCode);
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Call bluff ──────────────────────────────────
  socket.on('call_bluff', ({ roomCode, playerId }, callback) => {
    try {
      const room = rooms.get(roomCode?.toUpperCase());
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.phase !== 'playing') return callback({ success: false, error: 'Not in playing phase' });

      const currentPlayerId = room.turnOrder[room.currentTurnIndex];
      if (playerId !== currentPlayerId) return callback({ success: false, error: 'Not your turn' });
      if (room.bluffUsedThisTurn) return callback({ success: false, error: 'Bluff already called this turn' });
      if (room.isFirstTurn) return callback({ success: false, error: 'Cannot call bluff on the first turn' });

      room.bluffUsedThisTurn = true;
      room.phase = 'bluff_resolution';
      room.lastAction = { type: 'bluff_called', callerId: playerId };

      broadcastRoomState(io, roomCode.toUpperCase());
      callback({ success: true });
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Play card face-down ─────────────────────────
  socket.on('play_card', ({ roomCode, playerId }, callback) => {
    try {
      const room = rooms.get(roomCode?.toUpperCase());
      if (!room) return callback({ success: false, error: 'Room not found' });

      const currentPlayerId = room.turnOrder[room.currentTurnIndex];
      if (playerId !== currentPlayerId) return callback({ success: false, error: 'Not your turn' });
      if (room.phase !== 'playing') return callback({ success: false, error: 'Cannot play card now' });

      room.lastAction = { type: 'card_played', playerId };
      room.cardPlayedThisTurn = true;
      broadcastRoomState(io, roomCode.toUpperCase());
      callback({ success: true });
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: End turn ────────────────────────────────────
  socket.on('end_turn', ({ roomCode, playerId }, callback) => {
    try {
      const room = rooms.get(roomCode?.toUpperCase());
      if (!room) return callback({ success: false, error: 'Room not found' });

      const currentPlayerId = room.turnOrder[room.currentTurnIndex];
      if (playerId !== currentPlayerId) return callback({ success: false, error: 'Not your turn' });
      if (!room.cardPlayedThisTurn) return callback({ success: false, error: 'Play a card first' });

      room.cardPlayedThisTurn = false;
      room.bluffUsedThisTurn = false;
      engine.advanceTurn(room);

      const gameOverWinner = engine.checkGameOver(room);
      if (gameOverWinner) {
        room.phase = 'game_over';
        room.lastAction = { type: 'game_over', winnerId: gameOverWinner.id, winnerName: gameOverWinner.username };
      }

      broadcastRoomState(io, roomCode.toUpperCase());
      callback({ success: true });
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── DISCONNECT ──────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`[Socket] Disconnected: ${socket.id}`);

    for (const [code, room] of rooms.entries()) {
      if (room.hostSocketId === socket.id) {
        io.to(code).emit('host_disconnected');
        continue;
      }

      const player = room.players.find(p => p.socketId === socket.id);
      if (!player || player.status === 'eliminated') continue;

      if (room.phase === 'playing' || room.phase === 'bluff_resolution') {
        console.log(`[Room ${code}] Player ${player.username} disconnected — starting 10s grace period`);

        io.to(code).emit('player_disconnecting', { playerId: player.id, playerName: player.username });

        const timer = setTimeout(() => {
          const stillDisconnected = room.players.find(p => p.id === player.id && p.socketId === socket.id);
          if (stillDisconnected && stillDisconnected.status === 'alive') {
            const eliminated = engine.handleDisconnect(room, socket.id);
            if (eliminated) {
              console.log(`[Room ${code}] Player ${eliminated.username} grace period expired → eliminated`);
              room.lastAction = { type: 'disconnected', playerId: eliminated.id, playerName: eliminated.username };
              broadcastRoomState(io, code);
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
