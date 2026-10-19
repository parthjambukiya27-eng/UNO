// UNO Web Client Controller with Socket.io, Touch Gestures, Drag-and-Drop, and Multi-Device Support

// Set your live Render backend URL here (e.g., 'https://uno-online.onrender.com')
const RENDER_BACKEND_URL = 'https://uno-4qds.onrender.com';

function getApiBaseUrl() {
  if (RENDER_BACKEND_URL) return RENDER_BACKEND_URL.replace(/\/$/, '');
  const saved = localStorage.getItem('uno_backend_url');
  if (saved) return saved.replace(/\/$/, '');
  return '';
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
    this.pendingWildCardId = null;
    this.apiBase = getApiBaseUrl();

    this.init();
  }

  init() {
    this.socket = this.apiBase ? io(this.apiBase) : io();
    this.bindSocketEvents();
    this.bindDomEvents();
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
      const ipDisplay = document.getElementById('network-ip-display');
      if (ipDisplay && data.localIp !== 'localhost') {
        ipDisplay.textContent = `Play together on Wi-Fi: ${data.networkUrl}`;
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

    // Audio & Music Toggles
    document.getElementById('btn-toggle-sound')?.addEventListener('click', (e) => {
      window.unoAudio.soundEnabled = !window.unoAudio.soundEnabled;
      e.currentTarget.classList.toggle('is-muted', !window.unoAudio.soundEnabled);
      this.showToast(window.unoAudio.soundEnabled ? '🔊 Sound FX Enabled' : '🔇 Sound FX Muted');
    });

    document.getElementById('btn-toggle-music')?.addEventListener('click', (e) => {
      const active = window.unoAudio.toggleMusic();
      e.currentTarget.classList.toggle('is-active', active);
      this.showToast(active ? '🎵 Arcade Lounge Music Playing' : '🎵 Music Paused');
    });

    // How to Play Modal
    document.getElementById('btn-rules')?.addEventListener('click', () => {
      document.getElementById('modal-rules').classList.add('is-open');
    });
    document.getElementById('btn-close-rules')?.addEventListener('click', () => {
      document.getElementById('modal-rules').classList.remove('is-open');
    });

    // Leave Game
    document.getElementById('btn-leave-game')?.addEventListener('click', () => {
      if (confirm('Are you sure you want to leave this game?')) {
        window.location.href = '/';
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
    document.getElementById('tab-join')?.click();
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
      const angle = (index - (total - 1) / 2) * 2.5;
      const yOffset = Math.pow(Math.abs(index - (total - 1) / 2), 1.2) * 1.8;
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
    if (nextBtn) {
      nextBtn.style.display = this.isHost ? 'block' : 'none';
      nextBtn.onclick = () => {
        modal.classList.remove('is-open');
        this.startGame();
      };
    }

    modal.classList.add('is-open');
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
}

// Global initialization
window.addEventListener('DOMContentLoaded', () => {
  window.gameApp = new UnoClientApp();
});
