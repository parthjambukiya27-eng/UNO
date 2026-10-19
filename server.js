// UNO Real-Time Multiplayer Server with Socket.io, Network LAN Sharing, and Bot AI

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');
const QRCode = require('qrcode');
const cors = require('cors');

const UnoGame = require('./game/UnoGame');
const BotAI = require('./game/BotAI');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Store active games: roomCode -> UnoGame instance
const rooms = new Map();

// Helper: Get local network IP for playing from phones/tablets on same Wi-Fi
function getLocalNetworkIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const localIp = getLocalNetworkIp();

// QR Code API endpoint for instant phone scanning (Cloud & LAN compatible)
app.get('/api/qr/:roomCode', async (req, res) => {
  try {
    const { roomCode } = req.params;
    let baseUrl;
    if (req.query.origin) {
      baseUrl = req.query.origin;
    } else {
      const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
      const host = req.get('host') || `${localIp}:${PORT}`;
      baseUrl = `${proto}://${host}`;
    }
    const joinUrl = `${baseUrl}/?room=${roomCode.toUpperCase()}`;
    const qrDataUrl = await QRCode.toDataURL(joinUrl, {
      margin: 1,
      width: 250,
      color: {
        dark: '#191716',
        light: '#ffffff'
      }
    });
    res.json({ url: joinUrl, qr: qrDataUrl });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// Network info API
app.get('/api/network-info', (req, res) => {
  res.json({
    localIp,
    port: PORT,
    localUrl: `http://localhost:${PORT}`,
    networkUrl: `http://${localIp}:${PORT}`
  });
});

// Helper: Generate clean 4-character room code
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

// Bot Names and Avatars
const BOT_PROFILES = [
  { name: 'Alex Bot 🤖', avatar: '🤖' },
  { name: 'Maya AI 🦊', avatar: '🦊' },
  { name: 'Rex Pro 🦖', avatar: '🦖' },
  { name: 'Luna Neo 🦄', avatar: '🦄' },
  { name: 'Cyber Nova 👾', avatar: '👾' },
  { name: 'Blaze Tiger 🐯', avatar: '🐯' },
  { name: 'Shadow Ninja 🥷', avatar: '🥷' }
];

function broadcastGameState(game) {
  game.players.forEach(player => {
    if (player.socketId) {
      io.to(player.socketId).emit('game_update', game.getPlayerState(player.id));
    }
  });

  // Also broadcast to any spectators in the room
  io.to(game.roomCode).emit('room_spectator_update', game.getState());

  // Check if current turn is a Bot and game is in progress
  triggerBotTurnIfNeeded(game);
}

function triggerBotTurnIfNeeded(game) {
  if (game.status !== 'in_progress') return;

  const currentTurnPlayer = game.getCurrentPlayer();
  if (!currentTurnPlayer || !currentTurnPlayer.isBot) {
    // Check if a bot needs to respond to Wild Draw 4 challenge
    if (game.pendingChallenge) {
      const challenger = game.players.find(p => p.id === game.pendingChallenge.challengerId);
      if (challenger && challenger.isBot) {
        setTimeout(() => {
          if (!game.pendingChallenge) return;
          const target = game.players.find(p => p.id === game.pendingChallenge.targetPlayerId);
          const doChallenge = BotAI.shouldChallenge(target ? target.hand.length : 4);
          game.resolveChallenge(challenger.id, doChallenge);
          broadcastGameState(game);
        }, 1200);
      }
    }
    return;
  }

  // Handle pending 7-swap for bot
  if (game.pendingSwap && game.pendingSwap.playerId === currentTurnPlayer.id) {
    setTimeout(() => {
      // Pick opponent with lowest card count
      const opponents = game.players.filter(p => p.id !== currentTurnPlayer.id);
      opponents.sort((a, b) => a.hand.length - b.hand.length);
      if (opponents.length > 0) {
        game.swapHand7(currentTurnPlayer.id, opponents[0].id);
        broadcastGameState(game);
      }
    }, 900);
    return;
  }

  // Realistic Bot Thinking Delay (900ms - 1500ms)
  setTimeout(() => {
    if (game.status !== 'in_progress') return;
    if (game.getCurrentPlayer()?.id !== currentTurnPlayer.id) return;

    // Bot UNO call check: if bot has 2 cards and is about to play 1, 90% chance to shout UNO!
    if (currentTurnPlayer.hand.length === 2 && Math.random() < 0.92) {
      game.callUno(currentTurnPlayer.id);
      io.to(game.roomCode).emit('sound_effect', { sound: 'uno_shout', playerName: currentTurnPlayer.name });
    }

    // Bot catching human UNO check: if someone is vulnerable, bot may catch them
    if (game.unoVulnerable && Math.random() < 0.7) {
      game.catchUno(currentTurnPlayer.id);
      io.to(game.roomCode).emit('sound_effect', { sound: 'uno_caught' });
    }

    const opponents = game.players
      .filter(p => p.id !== currentTurnPlayer.id)
      .map(p => ({ cardCount: p.hand.length }));

    const bestCard = BotAI.selectBestCard(
      currentTurnPlayer.hand,
      game.getTopCard(),
      game.currentColor,
      opponents,
      game.stackedDrawCount,
      game.houseRules
    );

    if (bestCard) {
      // Play chosen card
      let chosenWildColor = null;
      if (bestCard.color === 'wild') {
        chosenWildColor = BotAI.chooseWildColor(currentTurnPlayer.hand);
      }

      game.playCard(currentTurnPlayer.id, bestCard.id, chosenWildColor);
      io.to(game.roomCode).emit('sound_effect', {
        sound: bestCard.value.includes('draw') ? 'card_attack' : 'card_play',
        card: bestCard
      });
      broadcastGameState(game);
    } else {
      // Draw card
      const drawResult = game.drawCard(currentTurnPlayer.id);
      io.to(game.roomCode).emit('sound_effect', { sound: 'card_draw' });

      // If drawn card can be played, bot decides whether to play it
      if (drawResult && drawResult.drawnCard && game.canPlayCard(currentTurnPlayer.id, drawResult.drawnCard.id)) {
        setTimeout(() => {
          let wildColor = null;
          if (drawResult.drawnCard.color === 'wild') {
            wildColor = BotAI.chooseWildColor(currentTurnPlayer.hand);
          }
          game.playCard(currentTurnPlayer.id, drawResult.drawnCard.id, wildColor);
          io.to(game.roomCode).emit('sound_effect', { sound: 'card_play', card: drawResult.drawnCard });
          broadcastGameState(game);
        }, 700);
      } else if (!drawResult.turnPassed) {
        // Pass turn
        setTimeout(() => {
          game.passTurn(currentTurnPlayer.id);
          broadcastGameState(game);
        }, 600);
      } else {
        broadcastGameState(game);
      }
    }
  }, 1000 + Math.random() * 500);
}

// Socket.io Connection Logic
io.on('connection', (socket) => {
  let currentRoom = null;
  let playerId = null;

  // Create Room
  socket.on('create_room', ({ playerName, avatar, houseRules }, callback) => {
    try {
      const roomCode = generateRoomCode();
      playerId = `player_${socket.id.substring(0, 8)}`;
      const hostPlayer = {
        id: playerId,
        name: playerName || 'Player 1',
        avatar: avatar || '👑',
        socketId: socket.id
      };

      const game = new UnoGame(roomCode, hostPlayer, houseRules);
      rooms.set(roomCode, game);
      currentRoom = roomCode;

      socket.join(roomCode);

      callback({
        success: true,
        roomCode,
        playerId,
        gameState: game.getPlayerState(playerId),
        shareUrl: `http://${localIp}:${PORT}/?room=${roomCode}`
      });

      broadcastGameState(game);
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // Join Room
  socket.on('join_room', ({ roomCode, playerName, avatar }, callback) => {
    try {
      const code = (roomCode || '').toUpperCase().trim();
      const game = rooms.get(code);

      if (!game) {
        return callback({ success: false, error: 'Room not found. Check the 4-letter code!' });
      }

      // Check if reconnecting player
      let existingPlayer = game.players.find(p => p.name.toLowerCase() === (playerName || '').toLowerCase());
      if (existingPlayer && !existingPlayer.isConnected) {
        existingPlayer.socketId = socket.id;
        existingPlayer.isConnected = true;
        playerId = existingPlayer.id;
        currentRoom = code;
        socket.join(code);

        callback({
          success: true,
          roomCode: code,
          playerId,
          gameState: game.getPlayerState(playerId)
        });

        broadcastGameState(game);
        return;
      }

      if (game.status !== 'waiting') {
        return callback({ success: false, error: 'Game is already in progress in this room.' });
      }

      playerId = `player_${socket.id.substring(0, 8)}`;
      const newPlayer = {
        id: playerId,
        name: playerName || `Player ${game.players.length + 1}`,
        avatar: avatar || '🎮',
        socketId: socket.id
      };

      game.addPlayer(newPlayer);
      currentRoom = code;
      socket.join(code);

      callback({
        success: true,
        roomCode: code,
        playerId,
        gameState: game.getPlayerState(playerId)
      });

      broadcastGameState(game);
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // Add AI Bot
  socket.on('add_bot', ({ roomCode }, callback) => {
    const game = rooms.get(roomCode);
    if (!game) return callback?.({ success: false, error: 'Room not found.' });

    const host = game.players.find(p => p.socketId === socket.id);
    if (!host || !host.isHost) {
      return callback?.({ success: false, error: 'Only the room host can add bots.' });
    }

    if (game.players.length >= 8) {
      return callback?.({ success: false, error: 'Max 8 players reached.' });
    }

    const availableProfiles = BOT_PROFILES.filter(bp => !game.players.some(p => p.name === bp.name));
    const profile = availableProfiles[0] || {
      name: `Bot ${game.players.length + 1}`,
      avatar: '🤖'
    };

    const botId = `bot_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    game.addPlayer({
      id: botId,
      name: profile.name,
      avatar: profile.avatar,
      isBot: true
    });

    broadcastGameState(game);
    callback?.({ success: true });
  });

  // Remove Player / Bot
  socket.on('kick_player', ({ roomCode, targetId }, callback) => {
    const game = rooms.get(roomCode);
    if (!game) return callback?.({ success: false, error: 'Room not found.' });

    const host = game.players.find(p => p.socketId === socket.id);
    if (!host || !host.isHost) {
      return callback?.({ success: false, error: 'Only host can kick players.' });
    }

    game.removePlayer(targetId);
    broadcastGameState(game);
    callback?.({ success: true });
  });

  // Start Round
  socket.on('start_game', ({ roomCode }, callback) => {
    const game = rooms.get(roomCode);
    if (!game) return callback?.({ success: false, error: 'Room not found.' });

    const host = game.players.find(p => p.socketId === socket.id);
    if (!host || !host.isHost) {
      return callback?.({ success: false, error: 'Only host can start the game.' });
    }

    try {
      game.startRound();
      io.to(roomCode).emit('sound_effect', { sound: 'game_start' });
      broadcastGameState(game);
      callback?.({ success: true });
    } catch (err) {
      callback?.({ success: false, error: err.message });
    }
  });

  // Play Card
  socket.on('play_card', ({ roomCode, cardId, chosenColor }, callback) => {
    const game = rooms.get(roomCode);
    if (!game) return callback?.({ success: false, error: 'Room not found.' });

    try {
      const result = game.playCard(playerId, cardId, chosenColor);
      io.to(roomCode).emit('sound_effect', {
        sound: 'card_play',
        card: game.getTopCard()
      });
      broadcastGameState(game);
      callback?.({ success: true, ...result });
    } catch (err) {
      callback?.({ success: false, error: err.message });
    }
  });

  // Choose Wild Color
  socket.on('choose_wild_color', ({ roomCode, color }, callback) => {
    const game = rooms.get(roomCode);
    if (!game) return callback?.({ success: false, error: 'Room not found.' });

    try {
      game.chooseWildColor(playerId, color);
      io.to(roomCode).emit('sound_effect', { sound: 'color_pick', color });
      broadcastGameState(game);
      callback?.({ success: true });
    } catch (err) {
      callback?.({ success: false, error: err.message });
    }
  });

  // Draw Card
  socket.on('draw_card', ({ roomCode }, callback) => {
    const game = rooms.get(roomCode);
    if (!game) return callback?.({ success: false, error: 'Room not found.' });

    try {
      const result = game.drawCard(playerId);
      io.to(roomCode).emit('sound_effect', { sound: 'card_draw' });
      broadcastGameState(game);
      callback?.({ success: true, ...result });
    } catch (err) {
      callback?.({ success: false, error: err.message });
    }
  });

  // Pass Turn
  socket.on('pass_turn', ({ roomCode }, callback) => {
    const game = rooms.get(roomCode);
    if (!game) return callback?.({ success: false, error: 'Room not found.' });

    try {
      game.passTurn(playerId);
      broadcastGameState(game);
      callback?.({ success: true });
    } catch (err) {
      callback?.({ success: false, error: err.message });
    }
  });

  // Call UNO
  socket.on('call_uno', ({ roomCode }, callback) => {
    const game = rooms.get(roomCode);
    if (!game) return callback?.({ success: false });

    const called = game.callUno(playerId);
    if (called) {
      const caller = game.players.find(p => p.id === playerId);
      io.to(roomCode).emit('sound_effect', { sound: 'uno_shout', playerName: caller?.name });
      broadcastGameState(game);
    }
    callback?.({ success: called });
  });

  // Catch UNO
  socket.on('catch_uno', ({ roomCode }, callback) => {
    const game = rooms.get(roomCode);
    if (!game) return callback?.({ success: false });

    const caught = game.catchUno(playerId);
    if (caught) {
      io.to(roomCode).emit('sound_effect', { sound: 'uno_caught' });
      broadcastGameState(game);
    }
    callback?.({ success: caught });
  });

  // Wild Draw 4 Challenge Response
  socket.on('resolve_challenge', ({ roomCode, doChallenge }, callback) => {
    const game = rooms.get(roomCode);
    if (!game) return callback?.({ success: false });

    try {
      game.resolveChallenge(playerId, doChallenge);
      io.to(roomCode).emit('sound_effect', { sound: doChallenge ? 'challenge' : 'card_draw' });
      broadcastGameState(game);
      callback?.({ success: true });
    } catch (err) {
      callback?.({ success: false, error: err.message });
    }
  });

  // 7-Swap Hand
  socket.on('swap_hand', ({ roomCode, targetPlayerId }, callback) => {
    const game = rooms.get(roomCode);
    if (!game) return callback?.({ success: false });

    try {
      game.swapHand7(playerId, targetPlayerId);
      io.to(roomCode).emit('sound_effect', { sound: 'swap' });
      broadcastGameState(game);
      callback?.({ success: true });
    } catch (err) {
      callback?.({ success: false, error: err.message });
    }
  });

  // Send Emoji Reaction or Chat
  socket.on('send_reaction', ({ roomCode, emoji }) => {
    const game = rooms.get(roomCode);
    if (!game) return;
    const player = game.players.find(p => p.id === playerId);
    io.to(roomCode).emit('player_reaction', {
      playerId,
      playerName: player ? player.name : 'Spectator',
      emoji
    });
  });

  // Update House Rules
  socket.on('update_rules', ({ roomCode, rules }, callback) => {
    const game = rooms.get(roomCode);
    if (!game) return callback?.({ success: false });
    const host = game.players.find(p => p.socketId === socket.id);
    if (!host || !host.isHost) return callback?.({ success: false, error: 'Only host can change rules.' });

    Object.assign(game.houseRules, rules);
    broadcastGameState(game);
    callback?.({ success: true });
  });

  // Disconnect
  socket.on('disconnect', () => {
    if (currentRoom) {
      const game = rooms.get(currentRoom);
      if (game) {
        const player = game.players.find(p => p.id === playerId);
        if (player) {
          player.isConnected = false;
          // If game is in waiting room, remove player immediately
          if (game.status === 'waiting') {
            game.removePlayer(playerId);
            if (game.players.length === 0) {
              rooms.delete(currentRoom);
            }
          }
          broadcastGameState(game);
        }
      }
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`🃏 UNO REAL-TIME MULTIPLAYER SERVER RUNNING!`);
  console.log(`👉 Local:   http://localhost:${PORT}`);
  console.log(`👉 Network: http://${localIp}:${PORT} (Any Phone/Device!)`);
  console.log(`====================================================`);
});
