// Full-Featured UNO Game Engine adhering to Official Mattel Rules and Popular House Rules

const { Deck, Card, COLORS } = require('./Deck');
const BotAI = require('./BotAI');

class UnoGame {
  constructor(roomCode, hostPlayer, houseRules = {}) {
    this.roomCode = roomCode;
    this.players = [];
    this.deck = new Deck();
    this.discardPile = [];
    this.currentColor = null;
    this.direction = 1; // 1 = clockwise, -1 = counter-clockwise
    this.currentTurnIndex = 0;
    this.stackedDrawCount = 0;
    this.status = 'waiting'; // 'waiting', 'in_progress', 'round_over', 'game_over'
    
    // House Rules Configuration
    this.houseRules = {
      stacking: true,          // Stacking +2 on +2 and +4 on +4
      stackDraw4On2: false,    // Stacking +4 on top of +2
      sevenZero: false,        // 7 swaps hand, 0 rotates hands
      jumpIn: false,           // Play exact card out of turn
      drawToMatch: false,      // Keep drawing until playable card found
      challengeRule: true,     // Official Wild Draw 4 challenge mechanic
      targetScore: 250,        // Score needed to win match (default 250, or 500)
      ...houseRules
    };

    this.pendingWildAction = null; // { playerId, card }
    this.pendingChallenge = null;  // { challengerId, targetPlayerId, card, previousColor }
    this.pendingSwap = null;       // { playerId, card } for 7-rule
    this.hasDrawnThisTurn = false;
    this.lastAction = null;
    this.winnerId = null;
    this.winnerName = null;
    this.unoCallers = new Set();   // Players who called UNO
    this.unoVulnerable = null;     // Player who has 1 card but hasn't called UNO yet

    if (hostPlayer) {
      this.addPlayer(hostPlayer);
    }
  }

  addPlayer(player) {
    if (this.players.length >= 8) {
      throw new Error('Room is full (max 8 players).');
    }
    if (this.status !== 'waiting') {
      throw new Error('Game already in progress.');
    }

    const newPlayer = {
      id: player.id,
      name: player.name || `Player ${this.players.length + 1}`,
      socketId: player.socketId || null,
      isBot: !!player.isBot,
      avatar: player.avatar || '😎',
      hand: [],
      score: 0,
      hasCalledUno: false,
      isConnected: true,
      isHost: this.players.length === 0
    };

    this.players.push(newPlayer);
    return newPlayer;
  }

  removePlayer(playerId) {
    const idx = this.players.findIndex(p => p.id === playerId);
    if (idx === -1) return false;

    const removed = this.players.splice(idx, 1)[0];

    // If host leaves, assign next player as host
    if (removed.isHost && this.players.length > 0) {
      this.players[0].isHost = true;
    }

    // If game in progress and fewer than 2 players left, reset or end
    if (this.status === 'in_progress' && this.players.length < 2) {
      this.status = 'waiting';
    } else if (this.status === 'in_progress') {
      if (this.currentTurnIndex >= this.players.length) {
        this.currentTurnIndex = 0;
      }
    }

    return true;
  }

  startRound() {
    if (this.players.length < 2) {
      throw new Error('Need at least 2 players to start.');
    }

    this.status = 'in_progress';
    this.deck.reset();
    this.discardPile = [];
    this.direction = 1;
    this.currentTurnIndex = 0;
    this.stackedDrawCount = 0;
    this.hasDrawnThisTurn = false;
    this.winnerId = null;
    this.winnerName = null;
    this.pendingWildAction = null;
    this.pendingChallenge = null;
    this.pendingSwap = null;
    this.unoCallers.clear();
    this.unoVulnerable = null;

    // Deal 7 cards to each player
    this.players.forEach(player => {
      player.hand = this.deck.drawMultiple(7);
      player.hasCalledUno = false;
    });

    // Flip top card of draw pile for discard pile
    let topCard = this.deck.draw();
    // Official rule: If initial card is Wild Draw 4, put back into deck and redraw
    while (topCard.value === 'wild4') {
      this.deck.insertCards([topCard]);
      topCard = this.deck.draw();
    }

    this.discardPile.push(topCard);
    this.currentColor = topCard.color;

    this.lastAction = {
      type: 'START_ROUND',
      message: `Round started! Top card is ${topCard.color} ${topCard.value}.`,
      card: topCard
    };

    // Handle starting action cards according to official rules
    if (topCard.color === 'wild') {
      // First player chooses color
      this.currentColor = COLORS[Math.floor(Math.random() * COLORS.length)];
      this.lastAction.message += ` Wild card starts as ${this.currentColor}!`;
    } else if (topCard.value === 'draw2') {
      // First player draws 2 cards and turn skips to next
      const firstPlayer = this.players[0];
      const drawn = this.deck.drawMultiple(2);
      firstPlayer.hand.push(...drawn);
      this.advanceTurn();
      this.lastAction.message += ` ${firstPlayer.name} drew 2 cards and was skipped!`;
    } else if (topCard.value === 'reverse') {
      // Reverse direction; in 2 player, dealer plays first
      if (this.players.length === 2) {
        this.advanceTurn();
      } else {
        this.direction = -1;
        this.currentTurnIndex = this.players.length - 1;
      }
      this.lastAction.message += ` Play direction reversed!`;
    } else if (topCard.value === 'skip') {
      // First player is skipped
      const skippedPlayer = this.players[0];
      this.advanceTurn();
      this.lastAction.message += ` ${skippedPlayer.name} was skipped!`;
    }

    return this.getState();
  }

  getTopCard() {
    return this.discardPile[this.discardPile.length - 1];
  }

  getCurrentPlayer() {
    return this.players[this.currentTurnIndex];
  }

  advanceTurn(steps = 1) {
    const total = this.players.length;
    this.currentTurnIndex = (this.currentTurnIndex + (this.direction * steps)) % total;
    if (this.currentTurnIndex < 0) {
      this.currentTurnIndex += total;
    }
    this.hasDrawnThisTurn = false;
  }

  ensureDeckHasCards(countNeeded = 1) {
    if (this.deck.count() < countNeeded) {
      if (this.discardPile.length <= 1) {
        // Deck and discard pile exhausted
        return;
      }
      const topCard = this.discardPile.pop();
      const cardsToReshuffle = this.discardPile;
      this.discardPile = [topCard];
      this.deck.insertCards(cardsToReshuffle);
    }
  }

  canPlayCard(playerId, cardId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return false;

    const card = player.hand.find(c => c.id === cardId);
    if (!card) return false;

    // Stacking penalty active
    if (this.stackedDrawCount > 0) {
      const top = this.getTopCard();
      if (this.houseRules.stacking) {
        if (top.value === 'draw2' && card.value === 'draw2') return true;
        if (top.value === 'draw2' && card.value === 'wild4' && this.houseRules.stackDraw4On2) return true;
        if (top.value === 'wild4' && card.value === 'wild4') return true;
      }
      return false; // must draw stacked penalty
    }

    // Normal play
    if (card.color === 'wild') return true;
    if (card.color === this.currentColor) return true;
    if (card.value === this.getTopCard().value) return true;

    return false;
  }

  playCard(playerId, cardId, chosenWildColor = null) {
    if (this.status !== 'in_progress') throw new Error('Game not currently in progress.');
    if (this.pendingWildAction) throw new Error('Waiting for color selection.');
    if (this.pendingChallenge) throw new Error('Waiting for challenge resolution.');
    if (this.pendingSwap) throw new Error('Waiting for 7-swap player selection.');

    const playerIndex = this.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) throw new Error('Player not found.');
    
    // Jump-In rule check
    const isTurn = playerIndex === this.currentTurnIndex;
    const player = this.players[playerIndex];
    const cardIndex = player.hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) throw new Error('Card not in hand.');
    const card = player.hand[cardIndex];
    const topCard = this.getTopCard();

    if (!isTurn) {
      if (this.houseRules.jumpIn && card.color === this.currentColor && card.value === topCard.value && card.color !== 'wild') {
        // Jump In allowed! Turn skips to this player
        this.currentTurnIndex = playerIndex;
      } else {
        throw new Error("It's not your turn!");
      }
    }

    if (!this.canPlayCard(playerId, cardId)) {
      throw new Error('Illegal card play.');
    }

    // Save previous color for potential Wild Draw 4 challenge
    const previousColor = this.currentColor;
    const hadMatchingColorBeforePlay = player.hand.some(c => c.color === previousColor && c.id !== cardId);

    // Remove card from hand
    player.hand.splice(cardIndex, 1);
    this.discardPile.push(card);

    // Track UNO declaration status
    if (player.hand.length === 1) {
      if (!this.unoCallers.has(player.id)) {
        // Player is vulnerable to being caught!
        this.unoVulnerable = player.id;
      }
    } else {
      this.unoCallers.delete(player.id);
      if (this.unoVulnerable === player.id) {
        this.unoVulnerable = null;
      }
    }

    // Handle Wild Card
    if (card.color === 'wild') {
      if (chosenWildColor && COLORS.includes(chosenWildColor)) {
        this.currentColor = chosenWildColor;
        this.finishCardPlay(player, card, chosenWildColor, previousColor, hadMatchingColorBeforePlay);
      } else {
        // Need player to choose color
        this.pendingWildAction = {
          playerId: player.id,
          card: card,
          previousColor,
          hadMatchingColorBeforePlay
        };
        return { needsWildColor: true, card };
      }
    } else {
      this.currentColor = card.color;
      this.finishCardPlay(player, card, null, previousColor, hadMatchingColorBeforePlay);
    }

    return this.getState();
  }

  chooseWildColor(playerId, color) {
    if (!this.pendingWildAction || this.pendingWildAction.playerId !== playerId) {
      throw new Error('No pending wild color choice for this player.');
    }
    if (!COLORS.includes(color)) {
      throw new Error('Invalid color chosen.');
    }

    const { card, previousColor, hadMatchingColorBeforePlay } = this.pendingWildAction;
    this.currentColor = color;
    this.pendingWildAction = null;

    const player = this.players.find(p => p.id === playerId);
    this.finishCardPlay(player, card, color, previousColor, hadMatchingColorBeforePlay);

    return this.getState();
  }

  finishCardPlay(player, card, chosenColor, previousColor, hadMatchingColorBeforePlay) {
    // Check Round Win condition
    if (player.hand.length === 0) {
      return this.handleRoundWin(player);
    }

    const colorMsg = chosenColor ? ` (changed color to ${chosenColor.toUpperCase()})` : '';
    this.lastAction = {
      type: 'CARD_PLAYED',
      playerId: player.id,
      playerName: player.name,
      card: card,
      chosenColor,
      message: `${player.name} played ${card.color !== 'wild' ? card.color : ''} ${card.value}${colorMsg}`
    };

    // 7-0 House Rule
    if (this.houseRules.sevenZero && card.value === '7') {
      this.pendingSwap = { playerId: player.id, card };
      return;
    }
    if (this.houseRules.sevenZero && card.value === '0') {
      this.rotateHands();
    }

    // Apply Card Effects
    if (card.value === 'skip') {
      this.advanceTurn(2);
      this.lastAction.effect = 'SKIP';
      return;
    }

    if (card.value === 'reverse') {
      if (this.players.length === 2) {
        // In 2 player, reverse acts as a skip
        this.advanceTurn(2);
      } else {
        this.direction *= -1;
        this.advanceTurn(1);
      }
      this.lastAction.effect = 'REVERSE';
      return;
    }

    if (card.value === 'draw2') {
      if (this.houseRules.stacking) {
        this.stackedDrawCount += 2;
        this.advanceTurn(1);
        this.lastAction.effect = 'DRAW2_STACK';
      } else {
        this.advanceTurn(1);
        const victim = this.getCurrentPlayer();
        this.ensureDeckHasCards(2);
        const drawn = this.deck.drawMultiple(2);
        victim.hand.push(...drawn);
        this.lastAction.effect = 'DRAW2';
        this.lastAction.victimId = victim.id;
        this.advanceTurn(1); // Victim loses turn
      }
      return;
    }

    if (card.value === 'wild4') {
      const nextPlayer = this.getNextPlayer();
      if (this.houseRules.challengeRule && !this.houseRules.stacking) {
        // Official Wild Draw 4 challenge prompt
        this.pendingChallenge = {
          challengerId: nextPlayer.id,
          targetPlayerId: player.id,
          card,
          previousColor,
          hadMatchingColorBeforePlay
        };
        this.lastAction.effect = 'WILD4_CHALLENGE';
        return;
      }

      if (this.houseRules.stacking) {
        this.stackedDrawCount += 4;
        this.advanceTurn(1);
        this.lastAction.effect = 'WILD4_STACK';
      } else {
        this.advanceTurn(1);
        const victim = this.getCurrentPlayer();
        this.ensureDeckHasCards(4);
        const drawn = this.deck.drawMultiple(4);
        victim.hand.push(...drawn);
        this.lastAction.effect = 'WILD4';
        this.lastAction.victimId = victim.id;
        this.advanceTurn(1); // Victim loses turn
      }
      return;
    }

    // Standard card: next turn
    this.advanceTurn(1);
  }

  getNextPlayer() {
    const total = this.players.length;
    let nextIndex = (this.currentTurnIndex + this.direction) % total;
    if (nextIndex < 0) nextIndex += total;
    return this.players[nextIndex];
  }

  resolveChallenge(challengerId, doChallenge) {
    if (!this.pendingChallenge || this.pendingChallenge.challengerId !== challengerId) {
      throw new Error('No pending challenge for this player.');
    }

    const { targetPlayerId, hadMatchingColorBeforePlay } = this.pendingChallenge;
    const targetPlayer = this.players.find(p => p.id === targetPlayerId);
    const challenger = this.players.find(p => p.id === challengerId);
    this.pendingChallenge = null;

    if (!doChallenge) {
      // Challenger accepted the +4
      this.ensureDeckHasCards(4);
      const drawn = this.deck.drawMultiple(4);
      challenger.hand.push(...drawn);
      this.lastAction = {
        type: 'CHALLENGE_ACCEPTED',
        message: `${challenger.name} accepted the Wild Draw 4 and drew 4 cards.`
      };
      this.advanceTurn(2); // Challenger skips turn
      return this.getState();
    }

    // Challenge performed!
    if (hadMatchingColorBeforePlay) {
      // Target was BLUFFING (illegal play): Target draws 4 cards!
      this.ensureDeckHasCards(4);
      const drawn = this.deck.drawMultiple(4);
      targetPlayer.hand.push(...drawn);
      this.lastAction = {
        type: 'CHALLENGE_WON',
        message: `Challenge SUCCESSFUL! ${targetPlayer.name} had a matching color and drew 4 cards penalty!`
      };
      // Challenger does not draw cards and plays their turn
      this.advanceTurn(1);
    } else {
      // Target was INNOCENT: Challenger draws 4 + 2 = 6 cards!
      this.ensureDeckHasCards(6);
      const drawn = this.deck.drawMultiple(6);
      challenger.hand.push(...drawn);
      this.lastAction = {
        type: 'CHALLENGE_LOST',
        message: `Challenge FAILED! ${targetPlayer.name} was innocent. ${challenger.name} drew 6 cards penalty!`
      };
      this.advanceTurn(2); // Challenger skips turn
    }

    return this.getState();
  }

  drawCard(playerId) {
    if (this.status !== 'in_progress') throw new Error('Game not in progress.');
    const playerIndex = this.players.findIndex(p => p.id === playerId);
    if (playerIndex !== this.currentTurnIndex) throw new Error("Not your turn!");

    const player = this.players[playerIndex];

    // If stacking is active and player draws, they take the full stacked penalty!
    if (this.stackedDrawCount > 0) {
      const penalty = this.stackedDrawCount;
      this.ensureDeckHasCards(penalty);
      const drawn = this.deck.drawMultiple(penalty);
      player.hand.push(...drawn);
      this.stackedDrawCount = 0;
      this.lastAction = {
        type: 'STACK_DRAW',
        playerId: player.id,
        playerName: player.name,
        count: penalty,
        message: `${player.name} couldn't stack and drew ${penalty} cards!`
      };
      this.advanceTurn(1);
      return { drawn, turnPassed: true };
    }

    // Standard draw
    this.ensureDeckHasCards(1);
    const card = this.deck.draw();
    if (!card) throw new Error('No cards left to draw.');
    player.hand.push(card);

    this.lastAction = {
      type: 'CARD_DRAWN',
      playerId: player.id,
      playerName: player.name,
      message: `${player.name} drew a card.`
    };

    // If Draw-To-Match house rule is active and card not playable, keep drawing
    if (this.houseRules.drawToMatch && !this.canPlayCard(playerId, card.id)) {
      let maxDraws = 10;
      while (maxDraws-- > 0 && !this.canPlayCard(playerId, card.id)) {
        this.ensureDeckHasCards(1);
        const extraCard = this.deck.draw();
        if (!extraCard) break;
        player.hand.push(extraCard);
      }
    }

    this.hasDrawnThisTurn = true;
    return { drawnCard: card, canPlay: this.canPlayCard(playerId, card.id) };
  }

  passTurn(playerId) {
    if (this.status !== 'in_progress') throw new Error('Game not in progress.');
    const playerIndex = this.players.findIndex(p => p.id === playerId);
    if (playerIndex !== this.currentTurnIndex) throw new Error("Not your turn!");

    if (!this.hasDrawnThisTurn) {
      throw new Error('Must draw a card before passing.');
    }

    const player = this.players[playerIndex];
    this.lastAction = {
      type: 'TURN_PASSED',
      playerId: player.id,
      playerName: player.name,
      message: `${player.name} passed their turn.`
    };

    this.advanceTurn(1);
    return this.getState();
  }

  callUno(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return false;

    // Player can call UNO if they have 2 cards (anticipating playing 1) or 1 card
    if (player.hand.length <= 2) {
      this.unoCallers.add(player.id);
      player.hasCalledUno = true;
      this.unoVulnerable = null;
      this.lastAction = {
        type: 'UNO_CALLED',
        playerId: player.id,
        playerName: player.name,
        message: `📢 ${player.name} shouted UNO!!`
      };
      return true;
    }
    return false;
  }

  catchUno(catcherId) {
    const catcher = this.players.find(p => p.id === catcherId);
    if (!catcher) return false;

    if (this.unoVulnerable) {
      const victim = this.players.find(p => p.id === this.unoVulnerable);
      if (victim && victim.id !== catcherId && victim.hand.length === 1 && !this.unoCallers.has(victim.id)) {
        // Caught! Victim draws 2 penalty cards
        this.ensureDeckHasCards(2);
        const penaltyCards = this.deck.drawMultiple(2);
        victim.hand.push(...penaltyCards);
        this.unoVulnerable = null;
        this.lastAction = {
          type: 'UNO_CAUGHT',
          catcherId: catcher.id,
          victimId: victim.id,
          message: `🚨 ${catcher.name} CAUGHT ${victim.name} not saying UNO! ${victim.name} drew 2 penalty cards!`
        };
        return true;
      }
    }
    return false;
  }

  swapHand7(playerId, targetPlayerId) {
    if (!this.pendingSwap || this.pendingSwap.playerId !== playerId) {
      throw new Error('No pending 7-swap action.');
    }
    const player = this.players.find(p => p.id === playerId);
    const target = this.players.find(p => p.id === targetPlayerId);
    if (!player || !target || player.id === target.id) {
      throw new Error('Invalid swap target.');
    }

    [player.hand, target.hand] = [target.hand, player.hand];
    this.pendingSwap = null;

    this.lastAction = {
      type: 'SEVEN_SWAP',
      message: `🔄 ${player.name} swapped hands with ${target.name}!`
    };

    this.advanceTurn(1);
    return this.getState();
  }

  rotateHands() {
    if (this.players.length < 2) return;
    const hands = this.players.map(p => p.hand);
    const total = this.players.length;

    this.players.forEach((player, idx) => {
      const sourceIdx = (idx - this.direction + total) % total;
      player.hand = hands[sourceIdx];
    });

    this.lastAction = {
      type: 'ZERO_ROTATE',
      message: `🌀 All player hands rotated ${this.direction === 1 ? 'clockwise' : 'counter-clockwise'}!`
    };
  }

  handleRoundWin(winner) {
    this.status = 'round_over';

    // Calculate score from opponents' hands
    let roundPoints = 0;
    this.players.forEach(p => {
      if (p.id !== winner.id) {
        p.hand.forEach(card => {
          roundPoints += card.getScoreValue();
        });
      }
    });

    winner.score += roundPoints;
    this.winnerId = winner.id;
    this.winnerName = winner.name;

    this.lastAction = {
      type: 'ROUND_WON',
      winnerId: winner.id,
      winnerName: winner.name,
      pointsEarned: roundPoints,
      message: `🎉 ${winner.name} won the round and earned ${roundPoints} points!`
    };

    if (winner.score >= this.houseRules.targetScore) {
      this.status = 'game_over';
      this.lastAction.type = 'GAME_WON';
      this.lastAction.message = `🏆👑 ${winner.name} REACHED ${winner.score} POINTS AND WON THE ENTIRE MATCH!`;
    }

    return this.getState();
  }

  // Returns safe public state for a specific player (keeps other players' hands hidden)
  getPlayerState(playerId) {
    const fullState = this.getState();
    const isSpectator = !this.players.some(p => p.id === playerId);

    return {
      ...fullState,
      myId: playerId,
      isSpectator,
      myHand: this.players.find(p => p.id === playerId)?.hand || [],
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        isBot: p.isBot,
        isHost: p.isHost,
        score: p.score,
        cardCount: p.hand.length,
        hasCalledUno: this.unoCallers.has(p.id),
        isVulnerable: this.unoVulnerable === p.id,
        isConnected: p.isConnected
      }))
    };
  }

  getState() {
    return {
      roomCode: this.roomCode,
      status: this.status,
      winnerId: this.winnerId || this.lastAction?.winnerId || null,
      winnerName: this.winnerName || this.lastAction?.winnerName || null,
      currentColor: this.currentColor,
      direction: this.direction,
      currentTurnIndex: this.currentTurnIndex,
      currentTurnPlayerId: this.players[this.currentTurnIndex]?.id || null,
      topCard: this.getTopCard() || null,
      deckCount: this.deck.count(),
      discardCount: this.discardPile.length,
      stackedDrawCount: this.stackedDrawCount,
      hasDrawnThisTurn: this.hasDrawnThisTurn,
      pendingWildAction: this.pendingWildAction,
      pendingChallenge: this.pendingChallenge,
      pendingSwap: this.pendingSwap,
      houseRules: this.houseRules,
      lastAction: this.lastAction,
      unoVulnerable: this.unoVulnerable
    };
  }
}

module.exports = UnoGame;
