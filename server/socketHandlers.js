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

  // ─── HOST: Create a new room ─────────────────────────────
  socket.on('create_room', ({ username }, callback) => {
    try {
      const room = engine.createRoom(socket.id);
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

  // ─── HOST: Trigger gun spin for specific player ───────────
  socket.on('trigger_spin', ({ roomCode, playerId }, callback) => {
    try {
      const room = rooms.get(roomCode);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.hostSocketId !== socket.id) return callback({ success: false, error: 'Not the host' });

      const player = room.players.find(p => p.id === playerId);
      if (!player) return callback({ success: false, error: 'Player not found' });

      const spinResult = engine.spinGun(player);

      if (spinResult.eliminated) {
        engine.eliminateFromTurnOrder(room, player.id);
      }

      room.lastAction = {
        type: 'spin',
        targetId: player.id,
        targetName: player.username,
        ...spinResult,
      };

      // Check game over after spin
      const gameOverWinner = engine.checkGameOver(room);
      if (gameOverWinner) {
        room.phase = 'game_over';
        room.lastAction = { type: 'game_over', winnerId: gameOverWinner.id, winnerName: gameOverWinner.username };
      }

      console.log(`[Room ${roomCode}] Spin for ${player.username}: roll=${spinResult.roll}, eliminated=${spinResult.eliminated}`);
      callback({ success: true, spinResult });
      broadcastRoomState(io, roomCode);
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── HOST: Resolve bluff ─────────────────────────────────
  socket.on('resolve_bluff', ({ roomCode, bluffIsCorrect }, callback) => {
    try {
      const room = rooms.get(roomCode);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.hostSocketId !== socket.id) return callback({ success: false, error: 'Not the host' });

      const { spinTarget, spinResult } = engine.resolveBluff(room, bluffIsCorrect);

      // Check game over
      const gameOverWinner = engine.checkGameOver(room);
      if (gameOverWinner) {
        room.phase = 'game_over';
        room.lastAction = { type: 'game_over', winnerId: gameOverWinner.id, winnerName: gameOverWinner.username };
      }

      console.log(`[Room ${roomCode}] Bluff resolved. ${spinTarget.username} spun. Eliminated: ${spinResult.eliminated}`);
      callback({ success: true });
      broadcastRoomState(io, roomCode);
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

  // ─── PLAYER: Call bluff (marks intent, host resolves) ────
  socket.on('call_bluff', ({ roomCode, playerId }, callback) => {
    try {
      const room = rooms.get(roomCode);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.phase !== 'playing') return callback({ success: false, error: 'Not in playing phase' });

      // Verify it's this player's turn to call bluff (they must be the current player)
      const currentPlayerId = room.turnOrder[room.currentTurnIndex];
      if (playerId !== currentPlayerId) return callback({ success: false, error: 'Not your turn to call bluff' });

      room.phase = 'bluff_resolution';
      room.lastAction = { type: 'bluff_called', callerId: playerId };

      // Notify host via room broadcast
      io.to(room.hostSocketId).emit('bluff_called', { callerId: playerId });

      callback({ success: true });
      broadcastRoomState(io, roomCode);
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Continue turn ───────────────────────────────
  socket.on('player_continue', ({ roomCode, playerId }, callback) => {
    try {
      const room = rooms.get(roomCode);
      if (!room) return callback({ success: false, error: 'Room not found' });

      // Only current player can continue
      const currentPlayerId = room.turnOrder[room.currentTurnIndex];
      if (playerId !== currentPlayerId) return callback({ success: false, error: 'Not your turn' });

      room.lastAction = { type: 'continued', playerId };
      callback({ success: true });
      broadcastRoomState(io, roomCode);
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── DISCONNECT ──────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`[Socket] Disconnected: ${socket.id}`);

    // Search all rooms for this socket
    for (const [code, room] of rooms.entries()) {
      // If host disconnects, notify players
      if (room.hostSocketId === socket.id) {
        io.to(code).emit('host_disconnected');
        continue;
      }

      // If player disconnects during game, eliminate them
      if (room.phase === 'playing' || room.phase === 'bluff_resolution') {
        const eliminated = engine.handleDisconnect(room, socket.id);
        if (eliminated) {
          console.log(`[Room ${code}] Player ${eliminated.username} disconnected → eliminated`);
          room.lastAction = { type: 'disconnected', playerId: eliminated.id, playerName: eliminated.username };
          broadcastRoomState(io, code);
        }
      }
    }
  });
}

module.exports = { registerSocketHandlers, rooms };
