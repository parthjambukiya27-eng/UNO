// UNO Web Client Controller with Socket.io, Touch Gestures, Drag-and-Drop, and Multi-Device Support

// Set your live Render backend URL here (e.g., 'https://uno-online.onrender.com')
const RENDER_BACKEND_URL = 'https://uno-4qds.onrender.com';

function getApiBaseUrl() {
  if (typeof window === 'undefined' || !window.location) {
    return RENDER_BACKEND_URL ? RENDER_BACKEND_URL.replace(/\/$/, '') : '';
  }

  const hostname = window.location.hostname;

  // Local development / LAN environments: use current server
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.') ||
    hostname.endsWith('.local')
  ) {
    return window.location.origin;
  }

  // If directly visiting the live Render domain, use relative origin
  if (RENDER_BACKEND_URL && window.location.origin === RENDER_BACKEND_URL.replace(/\/$/, '')) {
    return window.location.origin;
  }

  // When deployed to static host (like Vercel, Netlify, GitHub Pages), route all API calls to Render backend!
  if (RENDER_BACKEND_URL) {
    return RENDER_BACKEND_URL.replace(/\/$/, '');
  }

  const saved = localStorage.getItem('uno_backend_url');
  if (saved) return saved.replace(/\/$/, '');

  return window.location.origin;
}

class UnoClientApp {
  constructor() {
    this.socket = null;
    this.roomCode = null;
    this.playerId = null;
    this.gameState = null;
    this.myHand = [];
    this.isHost = false;
    this.selectedAvatar = '😎';
    this.regAvatar = '😎';
    this.currentUser = null;
    this.pendingWildCardId = null;
    this.apiBase = getApiBaseUrl();
    this.friendsList = [];
    this.activeFriendRooms = new Map();

    this.init();
  }

  init() {
    this.socket = this.apiBase ? io(this.apiBase) : io();
    this.bindSocketEvents();
    this.bindDomEvents();
    this.initAuth();
    this.loadSavedProfile();
    this.checkUrlParams();
    this.fetchNetworkInfo();
  }

  loadSavedProfile() {
    const savedName = localStorage.getItem('uno_player_name');
    const savedAvatar = localStorage.getItem('uno_avatar');
    if (savedName) {
      const nameInput = document.getElementById('player-name-input');
      if (nameInput) nameInput.value = savedName;
    }
    if (savedAvatar) {
      this.selectAvatar(savedAvatar);
    }
  }

  saveProfile(name, avatar) {
    if (name) localStorage.setItem('uno_player_name', name);
    if (avatar) localStorage.setItem('uno_avatar', avatar);
  }

  checkUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      const joinInput = document.getElementById('join-room-input');
      if (joinInput) {
        joinInput.value = roomParam.toUpperCase();
        this.showJoinTab();
      }
    }
  }

  async fetchNetworkInfo() {
    try {
      const res = await fetch(`${this.apiBase}/api/network-info`);
      const data = await res.json();
      if (data && data.networkUrl) {
        this.networkUrl = data.networkUrl;
      }
    } catch (e) {
      console.log('Network info fetch skipped');
    }
  }

  bindSocketEvents() {
    this.socket.on('game_update', (state) => {
      this.onGameStateUpdate(state);
    });

    this.socket.on('room_spectator_update', (state) => {
      if (!this.playerId) {
        this.onGameStateUpdate({ ...state, myHand: [], isSpectator: true });
      }
    });

    this.socket.on('sound_effect', (data) => {
      this.handleSoundEffect(data);
    });

    this.socket.on('player_reaction', ({ playerName, emoji }) => {
      UnoVFX.floatReaction(emoji);
      this.showToast(`${playerName}: ${emoji}`);
    });

    this.socket.on('disconnect', () => {
      this.showToast('Disconnected from server. Reconnecting...', 'error');
    });

    this.socket.on('connect', () => {
      console.log('Connected to UNO server.');
      if (this.currentUser) {
        this.emitUserOnline();
        this.fetchUserFriends();
      }
    });

    // Real-time friend game events
    this.socket.on('friend_game_created', (data) => {
      this.handleFriendGameCreated(data);
    });

    this.socket.on('friend_game_closed', (data) => {
      this.handleFriendGameClosed(data);
    });

    this.socket.on('friend_game_started', (data) => {
      this.handleFriendGameStarted(data);
    });

    this.socket.on('friend_presence_update', (data) => {
      this.handleFriendPresenceUpdate(data);
    });

    this.socket.on('friend_game_invite', (data) => {
      this.handleFriendGameInvite(data);
    });
  }

  bindDomEvents() {
    // Avatar selection
    document.querySelectorAll('.avatar-option').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectAvatar(btn.dataset.avatar);
      });
    });

    // Create Room Button
    document.getElementById('btn-create-room')?.addEventListener('click', () => {
      this.createRoom();
    });

    // Join Room Button
    document.getElementById('btn-join-room')?.addEventListener('click', () => {
      this.joinRoom();
    });

    // Quick Solo vs Bots
    document.getElementById('btn-quick-solo')?.addEventListener('click', () => {
      this.startSoloPlay();
    });

    // Start Game from Waiting Room
    document.getElementById('btn-start-game')?.addEventListener('click', () => {
      this.startGame();
    });

    // Add Bot Button
    document.getElementById('btn-add-bot')?.addEventListener('click', () => {
      this.addBot();
    });

    // Draw Card Button & Deck Click
    document.getElementById('btn-draw-card')?.addEventListener('click', () => {
      this.drawCard();
    });
    document.getElementById('draw-pile-deck')?.addEventListener('click', () => {
      this.drawCard();
    });

    // Pass Turn Button
    document.getElementById('btn-pass-turn')?.addEventListener('click', () => {
      this.passTurn();
    });

    // Shout UNO Button
    document.getElementById('btn-shout-uno')?.addEventListener('click', () => {
      this.callUno();
    });

    // Catch UNO Button
    document.getElementById('btn-catch-uno')?.addEventListener('click', () => {
      this.catchUno();
    });

    // Wild Color Picker Quadrants
    document.querySelectorAll('.wild-quad-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const color = btn.dataset.color;
        this.submitWildColor(color);
      });
    });

    // Challenge Responses
    document.getElementById('btn-accept-challenge')?.addEventListener('click', () => {
      this.resolveChallenge(false);
    });
    document.getElementById('btn-do-challenge')?.addEventListener('click', () => {
      this.resolveChallenge(true);
    });

    // Copy Share Link
    document.getElementById('btn-copy-link')?.addEventListener('click', () => {
      this.copyShareLink();
    });

    // Emoji reaction buttons
    document.querySelectorAll('.reaction-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const emoji = btn.dataset.emoji;
        this.sendReaction(emoji);
      });
    });

    // Header, Footer, and Navigation Events
    this.bindHeaderAndFooterEvents();
    this.bindKeyboardShortcuts();
    this.syncAudioUI();

    // Leave Game
    document.getElementById('btn-leave-game')?.addEventListener('click', () => {
      if (confirm('Are you sure you want to leave this game?')) {
        this.leaveToHome();
      }
    });

    // Setup drag-and-drop for center discard pile
    const discardZone = document.getElementById('discard-drop-zone');
    if (discardZone) {
      discardZone.addEventListener('dragover', (e) => e.preventDefault());
      discardZone.addEventListener('drop', (e) => {
        e.preventDefault();
        const cardId = e.dataTransfer.getData('text/plain');
        if (cardId) this.attemptPlayCard(cardId);
      });
    }
  }

  selectAvatar(avatar) {
    this.selectedAvatar = avatar;
    document.querySelectorAll('.avatar-option').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.avatar === avatar);
    });
  }

  showJoinTab() {
    const input = document.getElementById('join-room-input');
    if (input) {
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      input.focus();
    }
  }

  getPlayerName() {
    const input = document.getElementById('player-name-input');
    return (input?.value.trim()) || 'Player';
  }

  getHouseRulesConfig() {
    return {
      stacking: document.getElementById('rule-stacking')?.checked ?? true,
      stackDraw4On2: document.getElementById('rule-stack-4on2')?.checked ?? false,
      sevenZero: document.getElementById('rule-seven-zero')?.checked ?? false,
      jumpIn: document.getElementById('rule-jump-in')?.checked ?? false,
      drawToMatch: document.getElementById('rule-draw-match')?.checked ?? false,
      challengeRule: document.getElementById('rule-challenge')?.checked ?? true
    };
  }

  createRoom() {
    const playerName = this.getPlayerName();
    this.saveProfile(playerName, this.selectedAvatar);
    const houseRules = this.getHouseRulesConfig();

    this.socket.emit('create_room', {
      playerName,
      avatar: this.selectedAvatar,
      houseRules
    }, (res) => {
      if (res.success) {
        this.roomCode = res.roomCode;
        this.playerId = res.playerId;
        this.isHost = true;
        this.showWaitingRoom(res.shareUrl);
      } else {
        this.showToast(res.error, 'error');
      }
    });
  }

  joinRoom() {
    const roomCode = document.getElementById('join-room-input')?.value.trim();
    if (!roomCode) {
      return this.showToast('Please enter a 4-letter room code', 'warning');
    }

    const playerName = this.getPlayerName();
    this.saveProfile(playerName, this.selectedAvatar);

    this.socket.emit('join_room', {
      roomCode,
      playerName,
      avatar: this.selectedAvatar
    }, (res) => {
      if (res.success) {
        this.roomCode = res.roomCode;
        this.playerId = res.playerId;
        this.isHost = false;
        this.showWaitingRoom();
      } else {
        this.showToast(res.error, 'error');
      }
    });
  }

  joinRoomDirect(roomCode) {
    if (!roomCode) return;
    const cleanCode = roomCode.toUpperCase().trim();
    const joinInput = document.getElementById('join-room-input');
    if (joinInput) joinInput.value = cleanCode;

    // Dismiss floating alert if open
    const alertEl = document.getElementById('friend-room-alert');
    if (alertEl) alertEl.style.display = 'none';

    // Close friends modal if open
    document.getElementById('modal-friends')?.classList.remove('is-open');

    const playerName = this.getPlayerName();
    this.saveProfile(playerName, this.selectedAvatar);

    this.showToast(`Joining friend's game (Room ${cleanCode})...`);

    this.socket.emit('join_room', {
      roomCode: cleanCode,
      playerName,
      avatar: this.selectedAvatar
    }, (res) => {
      if (res.success) {
        this.roomCode = res.roomCode;
        this.playerId = res.playerId;
        this.isHost = false;
        this.showWaitingRoom();
        this.showToast(`🎉 Connected to Room ${cleanCode}!`, 'success');
      } else {
        this.showToast(res.error || 'Failed to join room', 'error');
      }
    });
  }

  startSoloPlay() {
    const playerName = this.getPlayerName();
    this.saveProfile(playerName, this.selectedAvatar);
    const houseRules = this.getHouseRulesConfig();

    this.socket.emit('create_room', {
      playerName,
      avatar: this.selectedAvatar,
      houseRules
    }, (res) => {
      if (res.success) {
        this.roomCode = res.roomCode;
        this.playerId = res.playerId;
        this.isHost = true;

        // Auto add 3 AI bots for a lively 4-player game
        this.socket.emit('add_bot', { roomCode: this.roomCode });
        this.socket.emit('add_bot', { roomCode: this.roomCode });
        this.socket.emit('add_bot', { roomCode: this.roomCode });

        setTimeout(() => {
          this.socket.emit('start_game', { roomCode: this.roomCode });
        }, 300);
      } else {
        this.showToast(res.error, 'error');
      }
    });
  }

  showWaitingRoom(shareUrl = null) {
    document.body.classList.remove('in-game');
    document.getElementById('view-lobby').classList.remove('active');
    document.getElementById('view-game').classList.remove('active');
    document.getElementById('view-waiting').classList.add('active');

    document.getElementById('waiting-room-code').textContent = this.roomCode;

    // Load QR Code for phones
    this.loadQrCode();

    // Toggle host controls
    const hostControls = document.getElementById('waiting-host-controls');
    if (hostControls) {
      hostControls.style.display = this.isHost ? 'flex' : 'none';
    }
  }

  async loadQrCode() {
    try {
      const origin = encodeURIComponent(window.location.origin);
      const res = await fetch(`${this.apiBase}/api/qr/${this.roomCode}?origin=${origin}`);
      const data = await res.json();
      const qrImg = document.getElementById('waiting-qr-img');
      const shareUrlInput = document.getElementById('share-url-input');
      if (qrImg) qrImg.src = data.qr;
      if (shareUrlInput) shareUrlInput.value = data.url;
    } catch (e) {
      console.log('QR code generation error');
    }
  }

  copyShareLink() {
    const input = document.getElementById('share-url-input');
    if (input) {
      input.select();
      navigator.clipboard.writeText(input.value);
      this.showToast('📋 Room Link copied to clipboard!');
    }
  }

  addBot() {
    this.socket.emit('add_bot', { roomCode: this.roomCode }, (res) => {
      if (!res?.success) this.showToast(res?.error, 'error');
    });
  }

  kickPlayer(targetId) {
    this.socket.emit('kick_player', { roomCode: this.roomCode, targetId });
  }

  startGame() {
    this.socket.emit('start_game', { roomCode: this.roomCode }, (res) => {
      if (!res?.success) this.showToast(res?.error, 'error');
    });
  }

  onGameStateUpdate(state) {
    this.gameState = state;
    this.myHand = state.myHand || [];
    const myPlayer = state.players?.find(p => p.id === this.playerId);
    if (myPlayer) this.isHost = myPlayer.isHost;

    if (state.status === 'waiting') {
      this.renderWaitingRoom(state);
      return;
    }

    // Switch to game arena view
    document.body.classList.add('in-game');
    document.getElementById('view-lobby').classList.remove('active');
    document.getElementById('view-waiting').classList.remove('active');
    document.getElementById('view-game').classList.add('active');

    this.renderGameArena(state);
    this.handleGameSpecialPrompts(state);
  }

  renderWaitingRoom(state) {
    const list = document.getElementById('waiting-player-list');
    if (!list) return;

    list.innerHTML = state.players.map(p => `
      <div class="waiting-player-card ${p.id === this.playerId ? 'is-self' : ''}">
        <span class="p-avatar">${p.avatar}</span>
        <div class="p-name">
          ${p.name}
          ${p.isHost ? '<span class="host-tag">Host 👑</span>' : ''}
          ${p.isBot ? '<span class="bot-tag">AI 🤖</span>' : ''}
        </div>
        ${this.isHost && p.id !== this.playerId ? `
          <button class="btn-kick" onclick="window.gameApp.kickPlayer('${p.id}')">✕</button>
        ` : ''}
      </div>
    `).join('');

    const startBtn = document.getElementById('btn-start-game');
    if (startBtn) {
      startBtn.disabled = state.players.length < 2;
    }
  }

  renderGameArena(state) {
    // 1. Header & Info
    document.getElementById('game-room-tag').textContent = `Room: ${state.roomCode}`;

    // Direction & Color Aura
    const tableEl = document.getElementById('game-table');
    tableEl.className = `game-table color-${state.currentColor || 'default'}`;

    // Direction & Color Compass
    const dirIndicator = document.getElementById('direction-indicator');
    const dirText = document.getElementById('direction-text');
    if (dirIndicator) {
      const isCW = state.direction === 1;
      const dirIcon = dirIndicator.querySelector('.dir-icon');
      if (dirIcon) dirIcon.textContent = isCW ? '↻' : '↺';
      if (dirText) dirText.textContent = isCW ? 'Clockwise' : 'Counter-CW';
    }

    // Stacked Counter Pill
    const stackPill = document.getElementById('stack-counter-pill');
    if (stackPill) {
      if (state.stackedDrawCount > 0) {
        stackPill.textContent = `+${state.stackedDrawCount} TO DRAW!`;
        stackPill.style.display = 'block';
      } else {
        stackPill.style.display = 'none';
      }
    }

    // Active Color Indicator
    const colorTag = document.getElementById('current-color-tag');
    const colorText = document.getElementById('color-name-text');
    if (colorTag) {
      colorTag.className = `current-color-badge color-${state.currentColor || 'default'}`;
      if (colorText) colorText.textContent = state.currentColor ? state.currentColor.toUpperCase() : 'WILD';
    }

    // 2. Discard Pile Top Card
    const discardContainer = document.getElementById('discard-pile-card');
    if (discardContainer && state.topCard) {
      discardContainer.innerHTML = CardRenderer.renderCard(state.topCard, false, false);
    }

    // 3. Render Opponent Seats around the table
    this.renderPlayerSeats(state);

    // 4. Render My Hand
    this.renderMyHand(state);

    // 5. Update Action Buttons
    this.updateActionButtons(state);

    // 6. Action Message Banner
    if (state.lastAction?.message) {
      this.showStatusBanner(state.lastAction.message);
    }
  }

  renderPlayerSeats(state) {
    const seatsContainer = document.getElementById('opponents-container');
    if (!seatsContainer) return;

    // Filter opponents (other than self)
    const opponents = state.players.filter(p => p.id !== this.playerId);
    const isCurrentTurnPlayer = (id) => state.currentTurnPlayerId === id;

    seatsContainer.innerHTML = opponents.map(p =>
      CardRenderer.renderPlayerSeat(p, isCurrentTurnPlayer(p.id), false)
    ).join('');

    // Self Player Seat (Bottom Info)
    const selfPlayer = state.players.find(p => p.id === this.playerId);
    const selfSeatContainer = document.getElementById('self-seat-container');
    if (selfSeatContainer && selfPlayer) {
      selfSeatContainer.innerHTML = CardRenderer.renderPlayerSeat(selfPlayer, isCurrentTurnPlayer(selfPlayer.id), true);
    }
  }

  renderMyHand(state) {
    const handContainer = document.getElementById('my-hand-container');
    if (!handContainer) return;

    const isMyTurn = state.currentTurnPlayerId === this.playerId;
    const total = this.myHand.length;

    handContainer.innerHTML = this.myHand.map((card) => {
      const isPlayable = isMyTurn && this.isCardPlayable(card, state);
      return CardRenderer.renderCard(card, isPlayable, true);
    }).join('');

    // Attach card event listeners and realistic curved fan layout
    handContainer.querySelectorAll('.uno-card').forEach((cardEl, index) => {
      const cardId = cardEl.dataset.cardId;
      const angle = total > 1 ? (index - (total - 1) / 2) * Math.min(2.4, 28 / total) : 0;
      const yOffset = Math.pow(Math.abs(index - (total - 1) / 2), 1.1) * 0.9;
      cardEl.style.transformOrigin = '50% 90%';
      cardEl.style.transform = `rotate(${angle}deg) translateY(${yOffset}px)`;

      cardEl.setAttribute('draggable', 'true');

      cardEl.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', cardId);
      });

      cardEl.addEventListener('click', () => {
        this.attemptPlayCard(cardId);
      });
    });

    // Count in hand badge
    const countBadge = document.getElementById('my-cards-count');
    if (countBadge) countBadge.textContent = `${this.myHand.length} Cards`;
  }

  isCardPlayable(card, state) {
    if (state.stackedDrawCount > 0) {
      const top = state.topCard;
      if (top.value === 'draw2' && card.value === 'draw2') return true;
      if (top.value === 'draw2' && card.value === 'wild4' && state.houseRules.stackDraw4On2) return true;
      if (top.value === 'wild4' && card.value === 'wild4') return true;
      return false;
    }

    if (card.color === 'wild') return true;
    if (card.color === state.currentColor) return true;
    if (card.value === state.topCard?.value) return true;
    return false;
  }

  updateActionButtons(state) {
    const isMyTurn = state.currentTurnPlayerId === this.playerId;
    const btnDraw = document.getElementById('btn-draw-card');
    const btnPass = document.getElementById('btn-pass-turn');
    const btnUno = document.getElementById('btn-shout-uno');
    const btnCatch = document.getElementById('btn-catch-uno');

    if (btnDraw) btnDraw.disabled = !isMyTurn;
    if (btnPass) btnPass.disabled = !isMyTurn || !state.hasDrawnThisTurn;

    // Shout UNO button: Highlight if player has 2 cards (ready to play 1) or 1 card
    if (btnUno) {
      const needsUno = this.myHand.length <= 2;
      btnUno.classList.toggle('pulse-attention', needsUno);
    }

    // Catch UNO button: Highlight if any opponent is vulnerable
    if (btnCatch) {
      const isSomeoneVulnerable = !!state.unoVulnerable && state.unoVulnerable !== this.playerId;
      btnCatch.classList.toggle('pulse-vulnerable', isSomeoneVulnerable);
      btnCatch.disabled = !isSomeoneVulnerable;
    }
  }

  attemptPlayCard(cardId) {
    const card = this.myHand.find(c => c.id === cardId);
    if (!card) return;

    // If card is wild, show color selection modal
    if (card.color === 'wild') {
      this.pendingWildCardId = cardId;
      document.getElementById('modal-wild-color').classList.add('is-open');
      return;
    }

    // Standard card play
    this.socket.emit('play_card', {
      roomCode: this.roomCode,
      cardId: cardId
    }, (res) => {
      if (!res.success) {
        this.showToast(res.error, 'warning');
      }
    });
  }

  submitWildColor(color) {
    document.getElementById('modal-wild-color').classList.remove('is-open');

    if (this.pendingWildCardId) {
      this.socket.emit('play_card', {
        roomCode: this.roomCode,
        cardId: this.pendingWildCardId,
        chosenColor: color
      }, (res) => {
        if (!res.success) this.showToast(res.error, 'warning');
      });
      this.pendingWildCardId = null;
    } else {
      this.socket.emit('choose_wild_color', {
        roomCode: this.roomCode,
        color
      }, (res) => {
        if (!res.success) this.showToast(res.error, 'warning');
      });
    }
  }

  drawCard() {
    this.socket.emit('draw_card', { roomCode: this.roomCode }, (res) => {
      if (!res.success) this.showToast(res.error, 'warning');
    });
  }

  passTurn() {
    this.socket.emit('pass_turn', { roomCode: this.roomCode }, (res) => {
      if (!res.success) this.showToast(res.error, 'warning');
    });
  }

  callUno() {
    this.socket.emit('call_uno', { roomCode: this.roomCode }, (res) => {
      if (res?.success) {
        this.showToast('📢 You shouted UNO!!', 'success');
      }
    });
  }

  catchUno() {
    this.socket.emit('catch_uno', { roomCode: this.roomCode }, (res) => {
      if (res?.success) {
        this.showToast('🚨 Caught an opponent without saying UNO!', 'success');
      } else {
        this.showToast('Nobody vulnerable right now.', 'info');
      }
    });
  }

  resolveChallenge(doChallenge) {
    document.getElementById('modal-challenge').classList.remove('is-open');
    this.socket.emit('resolve_challenge', {
      roomCode: this.roomCode,
      doChallenge
    });
  }

  handleGameSpecialPrompts(state) {
    // 1. Pending Wild Color selection for this player
    if (state.pendingWildAction && state.pendingWildAction.playerId === this.playerId) {
      document.getElementById('modal-wild-color').classList.add('is-open');
    }

    // 2. Pending Challenge prompt for this player
    if (state.pendingChallenge && state.pendingChallenge.challengerId === this.playerId) {
      document.getElementById('modal-challenge').classList.add('is-open');
    } else {
      document.getElementById('modal-challenge')?.classList.remove('is-open');
    }

    // 3. Pending 7-Swap prompt
    if (state.pendingSwap && state.pendingSwap.playerId === this.playerId) {
      this.show7SwapModal(state);
    }

    // 4. Round Over / Game Over
    if (state.status === 'round_over' || state.status === 'game_over') {
      this.showGameOverModal(state);
    }
  }

  show7SwapModal(state) {
    const modal = document.getElementById('modal-swap-7');
    const container = document.getElementById('swap-target-list');
    if (!modal || !container) return;

    const opponents = state.players.filter(p => p.id !== this.playerId);
    container.innerHTML = opponents.map(p => `
      <button class="btn-swap-target" onclick="window.gameApp.submitSwap7('${p.id}')">
        <span>${p.avatar} ${p.name}</span>
        <span>(${p.cardCount} cards)</span>
      </button>
    `).join('');

    modal.classList.add('is-open');
  }

  submitSwap7(targetPlayerId) {
    document.getElementById('modal-swap-7').classList.remove('is-open');
    this.socket.emit('swap_hand', {
      roomCode: this.roomCode,
      targetPlayerId
    });
  }

  showGameOverModal(state) {
    const modal = document.getElementById('modal-game-over');
    if (!modal) return;

    UnoVFX.triggerConfetti();
    window.unoAudio.playVictory();

    const title = document.getElementById('game-over-title');
    const message = document.getElementById('game-over-message');
    const scoresContainer = document.getElementById('game-over-scores');

    title.textContent = state.status === 'game_over' ? '🏆 MATCH CHAMPION! 🏆' : '🎉 ROUND WINNER! 🎉';
    message.textContent = state.lastAction?.message || 'Round complete!';

    // Sort players by score
    const sorted = [...state.players].sort((a, b) => b.score - a.score);
    scoresContainer.innerHTML = sorted.map((p, rank) => `
      <div class="score-row ${rank === 0 ? 'is-winner' : ''}">
        <span class="rank">${rank === 0 ? '👑' : '#' + (rank + 1)}</span>
        <span class="player">${p.avatar} ${p.name}</span>
        <span class="pts">${p.score} pts</span>
      </div>
    `).join('');

    const nextBtn = document.getElementById('btn-next-round');
    const homeBtn = document.getElementById('btn-game-over-home');
    const waitingHostHint = document.getElementById('game-over-waiting-host');

    if (nextBtn) {
      nextBtn.style.display = this.isHost ? 'inline-flex' : 'none';
      nextBtn.onclick = () => {
        modal.classList.remove('is-open');
        this.startGame();
      };
    }

    if (waitingHostHint) {
      waitingHostHint.style.display = (!this.isHost && state.status !== 'game_over') ? 'block' : 'none';
    }

    if (homeBtn) {
      homeBtn.onclick = () => {
        modal.classList.remove('is-open');
        this.leaveToHome();
      };
    }

    // If logged in, record match stats to MongoDB
    if (this.currentUser) {
      const winnerId = state.winnerId || state.lastAction?.winnerId;
      const selfPlayer = state.players.find(p => p.id === this.playerId);
      const isWinner = Boolean(
        (winnerId && winnerId === this.playerId) ||
        (selfPlayer && (selfPlayer.cardCount === 0 || selfPlayer.hand?.length === 0))
      );

      const pointsToRecord = (state.lastAction?.pointsEarned && isWinner)
        ? state.lastAction.pointsEarned
        : (isWinner ? (selfPlayer?.score || 50) : 0);

      // Prevent duplicate calls for the same round completion
      const roundKey = `${this.roomCode || 'game'}_${state.status}_${winnerId || 'now'}_${selfPlayer?.score || 0}`;
      if (this.lastRecordedGameKey !== roundKey) {
        this.lastRecordedGameKey = roundKey;
        this.recordUserGameStats(isWinner, pointsToRecord);
      }
    }

    modal.classList.add('is-open');
  }

  leaveToHome() {
    if (this.socket) {
      try {
        if (this.roomCode && this.playerId) {
          this.socket.emit('leave_room', { roomCode: this.roomCode, playerId: this.playerId });
        }
        this.socket.disconnect();
      } catch (e) {}
    }
    window.location.href = '/';
  }

  // --------------------------------------------------------------------------
  // USER AUTH & MONGODB PROFILE INTEGRATION
  // --------------------------------------------------------------------------
  initAuth() {
    this.checkDbStatus();
    this.loadSavedUser();

    // Open Auth Modal from header and footer
    ['btn-open-auth', 'btn-header-login', 'footer-link-login'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', () => {
        this.openAuthModal('login');
      });
    });

    ['btn-header-register', 'footer-link-register'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', () => {
        this.openAuthModal('register');
      });
    });

    document.querySelectorAll('.btn-close-auth').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('modal-auth')?.classList.remove('is-open');
      });
    });

    // Tab switcher (Log In vs Create Account)
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');
    const formLogin = document.getElementById('form-login');
    const formRegister = document.getElementById('form-register');

    tabLogin?.addEventListener('click', () => {
      tabLogin.classList.add('active');
      tabRegister?.classList.remove('active');
      formLogin.style.display = 'block';
      formRegister.style.display = 'none';
    });

    tabRegister?.addEventListener('click', () => {
      tabRegister.classList.add('active');
      tabLogin?.classList.remove('active');
      formRegister.style.display = 'block';
      formLogin.style.display = 'none';
    });

    // Avatar selector inside register form
    document.querySelectorAll('.auth-avatar-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.auth-avatar-opt').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.regAvatar = btn.dataset.avatar || '😎';
      });
    });

    // Handle Login Submit
    formLogin?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;
      const errBanner = document.getElementById('login-error-msg');
      if (errBanner) errBanner.style.display = 'none';

      try {
        const res = await fetch(`${this.apiBase}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const contentType = res.headers.get('content-type') || '';
        let data;
        if (contentType.includes('application/json')) {
          data = await res.json();
        } else {
          throw new Error('Backend server is temporarily unavailable. Please try again in a moment.');
        }
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Login failed');
        }

        this.setCurrentUser(data.user);
        document.getElementById('modal-auth')?.classList.remove('is-open');
        this.showToast(`👋 Welcome back, ${data.user.displayName || data.user.username}!`, 'success');
      } catch (err) {
        if (errBanner) {
          errBanner.textContent = err.message;
          errBanner.style.display = 'block';
        }
      }
    });

    // Handle Register Submit
    formRegister?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('reg-username').value.trim();
      const password = document.getElementById('reg-password').value;
      const errBanner = document.getElementById('register-error-msg');
      if (errBanner) errBanner.style.display = 'none';

      try {
        const res = await fetch(`${this.apiBase}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, avatar: this.regAvatar })
        });
        const contentType = res.headers.get('content-type') || '';
        let data;
        if (contentType.includes('application/json')) {
          data = await res.json();
        } else {
          throw new Error('Backend server is temporarily unavailable. Please try again in a moment.');
        }
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Registration failed');
        }

        this.setCurrentUser(data.user);
        document.getElementById('modal-auth')?.classList.remove('is-open');
        this.showToast(`🎉 Account created! Welcome, ${data.user.displayName || data.user.username}!`, 'success');
      } catch (err) {
        if (errBanner) {
          errBanner.textContent = err.message;
          errBanner.style.display = 'block';
        }
      }
    });

    // Handle Logout
    document.getElementById('btn-auth-logout')?.addEventListener('click', () => {
      this.logoutUser();
    });
  }

  async checkDbStatus() {
    // Status check for logging
    try {
      const res = await fetch(`${this.apiBase}/api/auth/status`);
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) return;
      const data = await res.json();
      this.isDbConnected = data.database === 'connected';
    } catch (e) {}
  }

  loadSavedUser() {
    try {
      const saved = localStorage.getItem('uno_user');
      if (saved) {
        const user = JSON.parse(saved);
        this.setCurrentUser(user, false);
      }
    } catch (e) {
      localStorage.removeItem('uno_user');
    }
  }

  setCurrentUser(user, updateInputs = true) {
    this.currentUser = user;
    localStorage.setItem('uno_user', JSON.stringify(user));

    const loggedOutEl = document.getElementById('user-logged-out');
    const loggedInEl = document.getElementById('user-logged-in');
    const avatarBadge = document.getElementById('user-badge-avatar');
    const nameBadge = document.getElementById('user-badge-name');
    const statsBadge = document.getElementById('user-badge-stats');

    if (loggedOutEl) loggedOutEl.style.display = 'none';
    if (loggedInEl) loggedInEl.style.display = 'flex';

    if (avatarBadge) avatarBadge.textContent = user.avatar || '😎';
    if (nameBadge) nameBadge.textContent = user.displayName || user.username;
    if (statsBadge) {
      const wins = user.stats?.wins || 0;
      const score = user.stats?.totalScore || 0;
      statsBadge.textContent = `${wins} Wins • ${score} Pts`;
    }

    if (updateInputs) {
      const nameInput = document.getElementById('player-name-input');
      if (nameInput) nameInput.value = user.displayName || user.username;
      if (user.avatar) this.selectAvatar(user.avatar);
      this.saveProfile(user.displayName || user.username, user.avatar);
    }

    this.emitUserOnline();
    this.fetchUserFriends();
  }

  logoutUser() {
    this.currentUser = null;
    localStorage.removeItem('uno_user');

    const loggedOutEl = document.getElementById('user-logged-out');
    const loggedInEl = document.getElementById('user-logged-in');
    if (loggedOutEl) loggedOutEl.style.display = 'flex';
    if (loggedInEl) loggedInEl.style.display = 'none';

    this.friendsList = [];
    this.activeFriendRooms.clear();
    this.updateFriendsBadge();
    this.renderLobbyActiveMatches();
    this.renderFriendsList([]);

    this.showToast('Logged out. Playing as Guest.');
  }

  openAuthModal(initialTab = 'login') {
    const modal = document.getElementById('modal-auth');
    if (modal) {
      const err1 = document.getElementById('login-error-msg');
      const err2 = document.getElementById('register-error-msg');
      if (err1) err1.style.display = 'none';
      if (err2) err2.style.display = 'none';
      if (initialTab === 'register') {
        document.getElementById('tab-register')?.click();
      } else {
        document.getElementById('tab-login')?.click();
      }
      modal.classList.add('is-open');
    }
  }

  async recordUserGameStats(won, score) {
    if (!this.currentUser) return;
    try {
      const res = await fetch(`${this.apiBase}/api/auth/record-game`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: this.currentUser.username,
          won: Boolean(won),
          score: Math.max(0, parseInt(score, 10) || 0)
        })
      });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) return;
      const data = await res.json();
      if (data.success && data.stats) {
        this.currentUser.stats = data.stats;
        this.setCurrentUser(this.currentUser, false);
        if (won) {
          this.showToast(`🏆 VICTORY! Total Wins: ${data.stats.wins} • Score: ${data.stats.totalScore}`, 'success');
        }
      }
    } catch (e) {
      console.log('Failed to record game stats:', e);
    }
  }

  handleSoundEffect(data) {
    switch (data.sound) {
      case 'card_play':
        window.unoAudio.playCardSnap();
        break;
      case 'card_attack':
        const isPlus4 = data.card?.value === 'wild4';
        window.unoAudio.playAttackBoom(isPlus4);
        break;
      case 'card_draw':
        window.unoAudio.playCardDraw();
        break;
      case 'uno_shout':
        window.unoAudio.playUnoShout();
        UnoVFX.triggerActionBadge(this.gameState?.players.find(p => p.name === data.playerName)?.id, 'UNO');
        break;
      case 'uno_caught':
        window.unoAudio.playUnoCaught();
        break;
      case 'challenge':
        window.unoAudio.playAttackBoom(true);
        break;
      case 'color_pick':
        UnoVFX.flashColorWave(data.color);
        break;
    }

    // Trigger visual action badge if applicable
    if (this.gameState?.lastAction?.effect) {
      const effect = this.gameState.lastAction.effect;
      const targetId = this.gameState.lastAction.victimId || this.gameState.currentTurnPlayerId;
      UnoVFX.triggerActionBadge(targetId, effect);
    }
  }

  sendReaction(emoji) {
    this.socket.emit('send_reaction', { roomCode: this.roomCode, emoji });
    UnoVFX.floatReaction(emoji);
  }

  showStatusBanner(msg) {
    const banner = document.getElementById('status-ticker');
    if (banner) {
      banner.textContent = msg;
      banner.classList.add('glow');
      setTimeout(() => banner.classList.remove('glow'), 1200);
    }
  }

  showToast(text, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = text;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 400);
    }, 2800);
  }

  // --------------------------------------------------------------------------
  // AUDIO SYNCHRONIZATION
  // --------------------------------------------------------------------------
  syncAudioUI() {
    const soundOn = window.unoAudio?.soundEnabled ?? true;
    const musicOn = window.unoAudio?.musicEnabled ?? false;

    // Sound toggle buttons
    ['btn-toggle-sound', 'header-sound-toggle', 'mob-sound-toggle'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.classList.toggle('is-muted', !soundOn);
        if (id === 'mob-sound-toggle') {
          el.textContent = soundOn ? '🔊 Sound FX (ON)' : '🔇 Sound FX (OFF)';
        } else {
          el.textContent = soundOn ? '🔊' : '🔇';
        }
      }
    });

    // Music toggle buttons
    ['btn-toggle-music', 'header-music-toggle', 'mob-music-toggle'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.classList.toggle('is-active', musicOn);
        if (id === 'mob-music-toggle') {
          el.textContent = musicOn ? '🎵 Arcade Music (ON)' : '🎵 Arcade Music (OFF)';
        }
      }
    });
  }

  toggleSound() {
    if (!window.unoAudio) return;
    window.unoAudio.soundEnabled = !window.unoAudio.soundEnabled;
    this.syncAudioUI();
    this.showToast(window.unoAudio.soundEnabled ? '🔊 Sound FX Enabled' : '🔇 Sound FX Muted');
  }

  toggleMusic() {
    if (!window.unoAudio) return;
    const active = window.unoAudio.toggleMusic();
    this.syncAudioUI();
    this.showToast(active ? '🎵 Arcade Lounge Music Playing' : '🎵 Music Paused');
  }

  // --------------------------------------------------------------------------
  // HEADER, FOOTER, AND SHORTCUTS BINDINGS
  // --------------------------------------------------------------------------
  bindHeaderAndFooterEvents() {
    // 1. Brand Logo click -> scroll to top
    document.getElementById('header-brand-logo')?.addEventListener('click', (e) => {
      if (document.getElementById('view-lobby')?.classList.contains('active')) {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });

    // 2. Rules openers
    ['btn-rules', 'nav-btn-rules', 'mob-btn-rules', 'footer-link-rules', 'footer-link-actions', 'footer-link-catch'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', () => {
        document.getElementById('modal-rules')?.classList.add('is-open');
        document.getElementById('mobile-nav-drawer')?.classList.remove('is-open');
      });
    });

    document.getElementById('btn-close-rules')?.addEventListener('click', () => {
      document.getElementById('modal-rules')?.classList.remove('is-open');
    });

    // 3. Modes scroll
    ['nav-btn-modes', 'mob-btn-modes'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', () => {
        document.querySelector('.modes-grid')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        document.getElementById('mobile-nav-drawer')?.classList.remove('is-open');
      });
    });

    // 4. House Rules scroll & toggle
    ['nav-btn-houserules', 'mob-btn-houserules', 'footer-link-stacking'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', () => {
        const accordion = document.querySelector('.rules-accordion');
        if (accordion) {
          accordion.open = true;
          accordion.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        document.getElementById('mobile-nav-drawer')?.classList.remove('is-open');
      });
    });

    // 5. Shortcuts modal opener & closer
    ['nav-btn-shortcuts', 'mob-btn-shortcuts', 'footer-link-shortcuts'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', () => {
        document.getElementById('modal-shortcuts')?.classList.add('is-open');
        document.getElementById('mobile-nav-drawer')?.classList.remove('is-open');
      });
    });

    document.getElementById('btn-close-shortcuts')?.addEventListener('click', () => {
      document.getElementById('modal-shortcuts')?.classList.remove('is-open');
    });

    // 6. Audio controls
    ['btn-toggle-sound', 'header-sound-toggle', 'mob-sound-toggle'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', () => this.toggleSound());
    });

    ['btn-toggle-music', 'header-music-toggle', 'mob-music-toggle'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', () => this.toggleMusic());
    });

    // 7. Mobile menu toggle
    document.getElementById('btn-mobile-menu')?.addEventListener('click', () => {
      document.getElementById('mobile-nav-drawer')?.classList.toggle('is-open');
    });

    // 8. Footer quick actions
    document.getElementById('footer-link-create')?.addEventListener('click', () => {
      this.createRoom();
    });

    document.getElementById('footer-link-join')?.addEventListener('click', () => {
      const joinInput = document.getElementById('join-room-input');
      if (joinInput) {
        joinInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        joinInput.focus();
      }
    });

    document.getElementById('footer-link-solo')?.addEventListener('click', () => {
      this.startSoloPlay();
    });

    document.getElementById('footer-link-party')?.addEventListener('click', () => {
      const shareUrl = window.location.origin;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(shareUrl);
        this.showToast('📋 Game URL copied! Share with friends on your Wi-Fi.', 'success');
      } else {
        this.showToast(`Share URL: ${shareUrl}`);
      }
    });

    document.getElementById('footer-btn-share')?.addEventListener('click', () => {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(window.location.origin);
        this.showToast('📋 Game URL copied to clipboard! Share with friends.', 'success');
      } else {
        this.showToast(`Share URL: ${window.location.origin}`);
      }
    });

    document.getElementById('btn-back-to-top')?.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // 9. Profile modal triggers & actions
    ['btn-header-profile', 'footer-link-profile'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', () => {
        this.openProfileModal();
      });
    });

    document.getElementById('btn-close-profile')?.addEventListener('click', () => {
      document.getElementById('modal-profile')?.classList.remove('is-open');
    });

    document.getElementById('btn-profile-signout')?.addEventListener('click', () => {
      document.getElementById('modal-profile')?.classList.remove('is-open');
      this.logoutUser();
    });

    // Profile modal avatar options
    document.querySelectorAll('.profile-avatar-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.profile-avatar-opt').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        const avatar = btn.dataset.avatar || '😎';
        this.selectAvatar(avatar);
        if (this.currentUser) {
          this.currentUser.avatar = avatar;
          this.setCurrentUser(this.currentUser, true);
          const bigAv = document.getElementById('profile-modal-avatar');
          if (bigAv) bigAv.textContent = avatar;
        }
        this.showToast(`Avatar updated to ${avatar}!`);
      });
    });

    // Close modals on clicking backdrop
    ['modal-profile', 'modal-shortcuts', 'modal-friends'].forEach(id => {
      const modal = document.getElementById(id);
      modal?.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('is-open');
      });
    });

    // 10. Friends Hub Modal Events
    ['nav-btn-friends', 'mob-btn-friends', 'footer-link-friends'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', () => {
        this.openFriendsModal();
        document.getElementById('mobile-nav-drawer')?.classList.remove('is-open');
      });
    });

    document.getElementById('btn-invite-friends')?.addEventListener('click', () => {
      this.openFriendsModal('my');
    });

    document.getElementById('btn-close-friends')?.addEventListener('click', () => {
      document.getElementById('modal-friends')?.classList.remove('is-open');
    });

    document.getElementById('btn-friend-alert-close')?.addEventListener('click', () => {
      const alertEl = document.getElementById('friend-room-alert');
      if (alertEl) alertEl.style.display = 'none';
    });

    document.getElementById('tab-friends-my')?.addEventListener('click', () => {
      document.getElementById('tab-friends-my')?.classList.add('active');
      document.getElementById('tab-friends-search')?.classList.remove('active');
      document.getElementById('panel-friends-list').style.display = 'block';
      document.getElementById('panel-friends-search').style.display = 'none';
      this.fetchUserFriends();
    });

    document.getElementById('tab-friends-search')?.addEventListener('click', () => {
      document.getElementById('tab-friends-search')?.classList.add('active');
      document.getElementById('tab-friends-my')?.classList.remove('active');
      document.getElementById('panel-friends-search').style.display = 'block';
      document.getElementById('panel-friends-list').style.display = 'none';
      document.getElementById('input-search-friends')?.focus();
    });

    document.getElementById('btn-go-search-friends')?.addEventListener('click', () => {
      document.getElementById('tab-friends-search')?.click();
    });

    // Friends Search handler
    const doSearch = () => {
      const input = document.getElementById('input-search-friends');
      if (input) this.searchUsers(input.value);
    };

    document.getElementById('btn-do-search-friends')?.addEventListener('click', doSearch);
    document.getElementById('input-search-friends')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        doSearch();
      }
    });

    let searchTimer = null;
    document.getElementById('input-search-friends')?.addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        this.searchUsers(e.target.value);
      }, 350);
    });

    document.getElementById('btn-friends-login')?.addEventListener('click', () => {
      document.getElementById('modal-friends')?.classList.remove('is-open');
      this.openAuthModal('login');
    });

    document.getElementById('btn-friends-register')?.addEventListener('click', () => {
      document.getElementById('modal-friends')?.classList.remove('is-open');
      this.openAuthModal('register');
    });
  }

  // --------------------------------------------------------------------------
  // KEYBOARD CONTROLS (TACTILE HOTKEYS)
  // --------------------------------------------------------------------------
  bindKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Don't intercept if user is typing in an input
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      const code = e.code;
      const key = e.key.toLowerCase();

      // Escape key: close open modals & mobile drawer
      if (code === 'Escape' || key === 'escape') {
        document.querySelectorAll('.modal-backdrop.is-open').forEach(m => m.classList.remove('is-open'));
        document.getElementById('mobile-nav-drawer')?.classList.remove('is-open');
        return;
      }

      // Check if active game table is visible
      const isGameActive = document.getElementById('view-game')?.classList.contains('active');

      if (isGameActive) {
        // Space or 'D' -> Draw card
        if (code === 'Space' || key === 'd') {
          e.preventDefault();
          this.drawCard();
          return;
        }

        // 'P' or Enter -> Pass turn
        if (key === 'p' || code === 'Enter') {
          const passBtn = document.getElementById('btn-pass-turn');
          if (passBtn && !passBtn.disabled) {
            e.preventDefault();
            this.passTurn();
          }
          return;
        }

        // 'U' -> Shout UNO!
        if (key === 'u') {
          e.preventDefault();
          this.callUno();
          return;
        }

        // 'C' -> Catch UNO!
        if (key === 'c') {
          const catchBtn = document.getElementById('btn-catch-uno');
          if (catchBtn && !catchBtn.disabled) {
            e.preventDefault();
            this.catchUno();
          }
          return;
        }
      }

      // 'M' -> Toggle Music
      if (key === 'm') {
        this.toggleMusic();
        return;
      }

      // 'S' -> Toggle Sound FX
      if (key === 's') {
        this.toggleSound();
        return;
      }
    });
  }

  // --------------------------------------------------------------------------
  // PLAYER PROFILE & DETAILED STATS MODAL
  // --------------------------------------------------------------------------
  openProfileModal() {
    if (!this.currentUser) {
      this.openAuthModal('login');
      this.showToast('Log in or sign up to view your permanent stats!', 'warning');
      return;
    }

    const modal = document.getElementById('modal-profile');
    if (!modal) return;

    const u = this.currentUser;
    const stats = u.stats || {};
    const games = stats.gamesPlayed || 0;
    const wins = stats.wins || 0;
    const losses = stats.losses || 0;
    const score = stats.totalScore || 0;
    const rate = games > 0 ? `${Math.round((wins / games) * 100)}%` : '0%';

    const avatarEl = document.getElementById('profile-modal-avatar');
    const nameEl = document.getElementById('profile-modal-name');
    const usernameEl = document.getElementById('profile-modal-username');
    const statGames = document.getElementById('profile-stat-games');
    const statWins = document.getElementById('profile-stat-wins');
    const statLosses = document.getElementById('profile-stat-losses');
    const statRate = document.getElementById('profile-stat-rate');
    const statScore = document.getElementById('profile-stat-score');

    if (avatarEl) avatarEl.textContent = u.avatar || '😎';
    if (nameEl) nameEl.textContent = u.displayName || u.username;
    if (usernameEl) usernameEl.textContent = `@${u.username}`;
    if (statGames) statGames.textContent = games;
    if (statWins) statWins.textContent = wins;
    if (statLosses) statLosses.textContent = losses;
    if (statRate) statRate.textContent = rate;
    if (statScore) statScore.textContent = score;

    // Highlight active avatar in profile modal
    document.querySelectorAll('.profile-avatar-opt').forEach(b => {
      b.classList.toggle('selected', b.dataset.avatar === (u.avatar || '😎'));
    });

    modal.classList.add('is-open');
  }

  // --------------------------------------------------------------------------
  // FRIENDS SYSTEM & REAL-TIME DIRECT JOIN METHODS
  // --------------------------------------------------------------------------
  emitUserOnline() {
    if (!this.currentUser || !this.socket) return;
    this.socket.emit('user_online', {
      username: this.currentUser.username,
      displayName: this.currentUser.displayName || this.currentUser.username,
      avatar: this.currentUser.avatar || '😎',
      friends: this.friendsList
    });
  }

  async fetchUserFriends() {
    if (!this.currentUser) return;
    try {
      const res = await fetch(`${this.apiBase}/api/auth/friends?username=${encodeURIComponent(this.currentUser.username)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.friends)) {
        this.friendsList = data.friends;
        this.updateFriendsBadge();
        this.queryFriendsPresence();
      }
    } catch (e) {
      console.log('Friends fetch error:', e);
    }
  }

  queryFriendsPresence() {
    if (!this.socket || this.friendsList.length === 0) {
      this.renderFriendsList([]);
      return;
    }
    const usernames = this.friendsList.map(f => f.username);
    this.socket.emit('get_friends_presence', { friendUsernames: usernames }, (presenceList) => {
      this.renderFriendsList(presenceList || []);
    });
  }

  handleFriendGameCreated(data) {
    if (!data || !data.roomCode) return;
    this.activeFriendRooms.set(data.roomCode, data);

    // If current user is already in a game, don't interrupt
    const isGameActive = document.getElementById('view-game')?.classList.contains('active');
    if (isGameActive) return;

    // 1. Show the top floating banner
    const alertEl = document.getElementById('friend-room-alert');
    const avEl = document.getElementById('friend-alert-avatar');
    const nameEl = document.getElementById('friend-alert-name');
    const codeEl = document.getElementById('friend-alert-code');
    const joinBtn = document.getElementById('btn-friend-alert-join');

    if (alertEl && nameEl && codeEl) {
      if (avEl) avEl.textContent = data.hostAvatar || '👑';
      nameEl.textContent = data.hostName || data.hostUsername;
      codeEl.textContent = data.roomCode;
      alertEl.style.display = 'block';

      if (joinBtn) {
        joinBtn.onclick = () => this.joinRoomDirect(data.roomCode);
      }
    }

    // 2. Render in Lobby active friend matches card
    this.renderLobbyActiveMatches();

    // 3. Highlight friends badge in header
    const badge = document.getElementById('header-friends-badge');
    if (badge) {
      badge.classList.add('has-match');
      badge.style.display = 'inline-flex';
    }

    // 4. Sound & toast
    this.showToast(`👑 ${data.hostName || 'Friend'} created Room ${data.roomCode}! Click to Join.`, 'success');
  }

  handleFriendGameClosed(data) {
    if (!data || !data.roomCode) return;
    this.activeFriendRooms.delete(data.roomCode);
    const codeEl = document.getElementById('friend-alert-code');
    if (codeEl && codeEl.textContent === data.roomCode) {
      const alertEl = document.getElementById('friend-room-alert');
      if (alertEl) alertEl.style.display = 'none';
    }
    this.renderLobbyActiveMatches();
    this.queryFriendsPresence();
  }

  handleFriendGameStarted(data) {
    if (!data || !data.roomCode) return;
    this.activeFriendRooms.delete(data.roomCode);
    const alertEl = document.getElementById('friend-room-alert');
    const codeEl = document.getElementById('friend-alert-code');
    if (codeEl && codeEl.textContent === data.roomCode && alertEl) {
      alertEl.style.display = 'none';
    }
    this.renderLobbyActiveMatches();
    this.queryFriendsPresence();
  }

  handleFriendPresenceUpdate() {
    this.queryFriendsPresence();
  }

  handleFriendGameInvite(data) {
    if (!data || !data.roomCode) return;
    this.showToast(`👑 ${data.hostName} invited you to play UNO in Room ${data.roomCode}!`, 'warning');
    this.handleFriendGameCreated(data);
  }

  renderLobbyActiveMatches() {
    const container = document.getElementById('active-friend-matches-card');
    const list = document.getElementById('friend-matches-list');
    if (!container || !list) return;

    if (this.activeFriendRooms.size === 0) {
      container.style.display = 'none';
      list.innerHTML = '';
      return;
    }

    container.style.display = 'block';
    list.innerHTML = Array.from(this.activeFriendRooms.values()).map(r => `
      <div class="friend-match-row">
        <div class="friend-match-meta">
          <span class="friend-match-avatar">${r.hostAvatar || '👑'}</span>
          <div>
            <div class="friend-match-name">${r.hostName || r.hostUsername}</div>
            <div class="friend-match-room-tag">Room Code: <strong style="color: var(--uno-red); letter-spacing: 1px;">${r.roomCode}</strong> (Waiting)</div>
          </div>
        </div>
        <button class="btn-row-join" onclick="window.gameApp.joinRoomDirect('${r.roomCode}')">
          <span>⚡</span> Join Game
        </button>
      </div>
    `).join('');
  }

  renderFriendsList(presenceList) {
    const container = document.getElementById('friends-list-container');
    const emptyState = document.getElementById('friends-empty-state');
    const totalCount = document.getElementById('friends-total-count');
    if (totalCount) totalCount.textContent = this.friendsList.length;

    if (!this.currentUser) {
      document.getElementById('friends-guest-notice').style.display = 'block';
      if (container) container.innerHTML = '';
      if (emptyState) emptyState.style.display = 'none';
      return;
    }

    document.getElementById('friends-guest-notice').style.display = 'none';

    if (this.friendsList.length === 0) {
      if (container) container.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    const presenceMap = new Map();
    if (Array.isArray(presenceList)) {
      presenceList.forEach(p => presenceMap.set(p.username.toLowerCase(), p));
    }

    // Sort: Hosting friends first, then online, then offline
    const sorted = [...this.friendsList].sort((a, b) => {
      const pA = presenceMap.get(a.username.toLowerCase()) || {};
      const pB = presenceMap.get(b.username.toLowerCase()) || {};
      const scoreA = pA.roomCode ? 2 : (pA.isOnline ? 1 : 0);
      const scoreB = pB.roomCode ? 2 : (pB.isOnline ? 1 : 0);
      return scoreB - scoreA;
    });

    if (container) {
      container.innerHTML = sorted.map(f => {
        const pres = presenceMap.get(f.username.toLowerCase()) || {};
        const isOnline = pres.isOnline;
        const roomCode = pres.roomCode;
        const status = pres.status || 'offline';

        let statusText = 'Offline';
        let statusClass = '';
        let actionBtn = '';

        if (roomCode && status === 'waiting') {
          statusText = `🟢 Hosting Room ${roomCode}`;
          statusClass = 'status-hosting';
          actionBtn = `<button class="btn-friend-join" onclick="window.gameApp.joinRoomDirect('${roomCode}')">⚡ Join</button>`;
        } else if (status === 'in_progress') {
          statusText = '🟡 In Match';
        } else if (isOnline) {
          statusText = '🟢 Online in Lobby';
          if (this.roomCode && this.isHost) {
            actionBtn = `<button class="btn-friend-invite" onclick="window.gameApp.inviteFriend('${f.username}', '${this.roomCode}')">👑 Invite</button>`;
          }
        }

        return `
          <div class="friend-item-card">
            <div class="friend-item-left">
              <div class="friend-avatar-wrapper">
                <span class="friend-item-avatar">${f.avatar || '😎'}</span>
                <span class="friend-online-dot ${isOnline ? (roomCode ? 'is-hosting' : 'is-online') : ''}"></span>
              </div>
              <div class="friend-item-info">
                <span class="friend-item-name">${f.displayName || f.username}</span>
                <span class="friend-item-status ${statusClass}">${statusText}</span>
              </div>
            </div>
            <div class="friend-item-actions">
              ${actionBtn}
              <button class="btn-remove-friend" title="Remove Friend" onclick="window.gameApp.removeFriend('${f.username}')">✕</button>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  updateFriendsBadge() {
    const badge = document.getElementById('header-friends-badge');
    if (badge) {
      if (this.friendsList.length > 0) {
        badge.textContent = this.friendsList.length;
        badge.style.display = 'inline-flex';
      } else {
        badge.style.display = 'none';
      }
    }
  }

  inviteFriend(friendUsername, roomCode) {
    if (!this.socket || !friendUsername || !roomCode) return;
    this.socket.emit('invite_friend', { toUsername: friendUsername, roomCode }, (res) => {
      if (res?.success) {
        this.showToast(`📨 Sent invite to ${friendUsername}!`, 'success');
      } else {
        this.showToast(res?.error || 'Could not send invite.', 'warning');
      }
    });
  }

  openFriendsModal(tab = 'my') {
    const modal = document.getElementById('modal-friends');
    if (!modal) return;

    if (!this.currentUser) {
      document.getElementById('friends-guest-notice').style.display = 'block';
      document.getElementById('panel-friends-list').style.display = 'none';
      document.getElementById('panel-friends-search').style.display = 'none';
      modal.classList.add('is-open');
      return;
    }

    document.getElementById('friends-guest-notice').style.display = 'none';
    if (tab === 'search') {
      document.getElementById('tab-friends-search')?.click();
    } else {
      document.getElementById('tab-friends-my')?.click();
    }

    this.fetchUserFriends();
    modal.classList.add('is-open');
  }

  async searchUsers(query) {
    const q = (query || '').trim();
    const resultsContainer = document.getElementById('friends-search-results');
    if (!resultsContainer) return;

    if (q.length < 2) {
      resultsContainer.innerHTML = '<div class="search-hint">Type at least 2 characters to search for registered players.</div>';
      return;
    }

    resultsContainer.innerHTML = '<div class="search-hint">🔍 Searching players...</div>';

    try {
      const cur = this.currentUser ? this.currentUser.username : '';
      const res = await fetch(`${this.apiBase}/api/auth/search-users?q=${encodeURIComponent(q)}&current=${encodeURIComponent(cur)}`);
      const data = await res.json();

      if (!data.success || !Array.isArray(data.users) || data.users.length === 0) {
        resultsContainer.innerHTML = '<div class="search-hint">No players found matching that name.</div>';
        return;
      }

      const friendUsernames = new Set(this.friendsList.map(f => f.username.toLowerCase()));

      resultsContainer.innerHTML = data.users.map(u => {
        const isFriend = friendUsernames.has(u.username.toLowerCase());
        return `
          <div class="search-result-item">
            <div class="friend-item-left">
              <span class="friend-item-avatar">${u.avatar || '😎'}</span>
              <div class="friend-item-info">
                <span class="friend-item-name">${u.displayName || u.username}</span>
                <span class="friend-item-status">@${u.username} • 🏆 ${u.wins || 0} Wins</span>
              </div>
            </div>
            <div>
              ${isFriend ? `
                <button class="btn-add-friend-action is-added" disabled>✓ Friends</button>
              ` : `
                <button class="btn-add-friend-action" onclick="window.gameApp.addFriend('${u.username}')">+ Add Friend</button>
              `}
            </div>
          </div>
        `;
      }).join('');
    } catch (e) {
      resultsContainer.innerHTML = '<div class="search-hint">Search error. Please try again.</div>';
    }
  }

  async addFriend(friendUsername) {
    if (!this.currentUser) return;
    try {
      const res = await fetch(`${this.apiBase}/api/auth/add-friend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: this.currentUser.username,
          friendUsername: friendUsername
        })
      });
      const data = await res.json();
      if (data.success) {
        this.showToast(data.message || `Added ${friendUsername}!`, 'success');
        await this.fetchUserFriends();
        const searchInput = document.getElementById('input-search-friends');
        if (searchInput && searchInput.value.trim()) {
          this.searchUsers(searchInput.value.trim());
        }
      } else {
        this.showToast(data.error || 'Failed to add friend', 'error');
      }
    } catch (e) {
      this.showToast('Network error adding friend', 'error');
    }
  }

  async removeFriend(friendUsername) {
    if (!this.currentUser) return;
    if (!confirm(`Remove ${friendUsername} from your friends?`)) return;

    try {
      const res = await fetch(`${this.apiBase}/api/auth/remove-friend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: this.currentUser.username,
          friendUsername: friendUsername
        })
      });
      const data = await res.json();
      if (data.success) {
        this.showToast(`Removed ${friendUsername} from friends`);
        await this.fetchUserFriends();
      }
    } catch (e) {
      this.showToast('Network error removing friend', 'error');
    }
  }
}

// Global initialization
window.addEventListener('DOMContentLoaded', () => {
  window.gameApp = new UnoClientApp();
});
