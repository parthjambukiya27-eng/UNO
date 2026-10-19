// High-Definition UNO Card and Visual Component Renderer

class CardRenderer {
  // SVG Icons for Action Cards
  static getSkipIcon() {
    return `
      <svg class="action-icon" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="12" stroke-linecap="round">
        <circle cx="50" cy="50" r="38" />
        <line x1="24" y1="24" x2="76" y2="76" />
      </svg>
    `;
  }

  static getReverseIcon() {
    return `
      <svg class="action-icon" viewBox="0 0 100 100" fill="currentColor">
        <path d="M78 32 H32 V18 L12 38 L32 58 V44 H78 A10 10 0 0 1 88 54 V58 H100 V54 A22 22 0 0 0 78 32 Z" />
        <path d="M22 68 H68 V82 L88 62 L68 42 V56 H22 A10 10 0 0 1 12 46 V42 H0 V46 A22 22 0 0 0 22 68 Z" />
      </svg>
    `;
  }

  static getDraw2Icon() {
    return `
      <div class="draw2-icon-group">
        <div class="mini-card c1">+2</div>
        <div class="mini-card c2">+2</div>
      </div>
    `;
  }

  static getWildWheel() {
    return `
      <div class="wild-wheel">
        <div class="quad red"></div>
        <div class="quad blue"></div>
        <div class="quad yellow"></div>
        <div class="quad green"></div>
        <div class="wild-center-text">WILD</div>
      </div>
    `;
  }

  static getWild4Graphic() {
    return `
      <div class="wild4-graphic">
        <div class="mini-fan c-red"></div>
        <div class="mini-fan c-blue"></div>
        <div class="mini-fan c-yellow"></div>
        <div class="mini-fan c-green"></div>
        <div class="wild4-number">+4</div>
      </div>
    `;
  }

  // Generates HTML for an authentic 3D UNO card
  static renderCard(card, isPlayable = false, isInteractive = true) {
    const isWild = card.color === 'wild';
    const colorClass = `card-${card.color}`;
    const playableClass = isPlayable ? 'is-playable' : '';
    const interactiveClass = isInteractive ? 'is-interactive' : '';

    let centerContent = '';
    let cornerLabel = '';

    switch (card.value) {
      case 'skip':
        centerContent = CardRenderer.getSkipIcon();
        cornerLabel = '⊘';
        break;
      case 'reverse':
        centerContent = CardRenderer.getReverseIcon();
        cornerLabel = '⇄';
        break;
      case 'draw2':
        centerContent = CardRenderer.getDraw2Icon();
        cornerLabel = '+2';
        break;
      case 'wild':
        centerContent = CardRenderer.getWildWheel();
        cornerLabel = '★';
        break;
      case 'wild4':
        centerContent = CardRenderer.getWild4Graphic();
        cornerLabel = '+4';
        break;
      default: // 0-9
        centerContent = `<span class="card-number-large">${card.value}</span>`;
        cornerLabel = card.value;
        break;
    }

    return `
      <div class="uno-card ${colorClass} ${playableClass} ${interactiveClass}" 
           data-card-id="${card.id}" 
           data-color="${card.color}" 
           data-value="${card.value}">
        <div class="card-inner">
          <div class="card-glare"></div>
          <div class="corner corner-tl">
            <span class="corner-val">${cornerLabel}</span>
          </div>
          <div class="card-center-oval">
            ${centerContent}
          </div>
          <div class="corner corner-br">
            <span class="corner-val">${cornerLabel}</span>
          </div>
        </div>
      </div>
    `;
  }

  // Card Back for Draw Pile or Hidden Opponent Hands
  static renderCardBack(count = 1) {
    return `
      <div class="uno-card card-back">
        <div class="card-inner">
          <div class="card-glare"></div>
          <div class="card-center-oval back-oval">
            <div class="back-logo">UNO</div>
          </div>
          ${count > 1 ? `<div class="card-back-count">${count}</div>` : ''}
        </div>
      </div>
    `;
  }

  // Renders a Player Name Card / Seat Badge
  static renderPlayerSeat(player, isCurrentTurn = false, isSelf = false) {
    const turnClass = isCurrentTurn ? 'active-turn' : '';
    const unoClass = player.hasCalledUno ? 'has-uno' : '';
    const vulnerableClass = player.isVulnerable ? 'is-vulnerable' : '';
    const selfClass = isSelf ? 'seat-self' : '';

    return `
      <div class="player-seat ${turnClass} ${unoClass} ${vulnerableClass} ${selfClass}" id="seat-${player.id}" data-player-id="${player.id}">
        <div class="seat-turn-ring"></div>
        <div class="seat-avatar">${player.avatar}</div>
        <div class="seat-info">
          <div class="seat-name">
            ${player.name}
            ${player.isHost ? '<span class="host-badge">👑 Host</span>' : ''}
          </div>
          <div class="seat-meta">
            <span class="card-count-badge">🃏 ${player.cardCount} cards</span>
            <span class="seat-score">★ ${player.score} pts</span>
          </div>
        </div>
        
        <!-- Action Overlay Badges for +2, +4, Reverse, Skip, UNO -->
        <div class="seat-action-overlay" id="action-overlay-${player.id}"></div>

        ${player.hasCalledUno ? '<div class="seat-uno-pill">UNO!</div>' : ''}
        ${player.isVulnerable ? '<div class="seat-catch-pill" onclick="window.gameApp.catchUno()">CATCH!</div>' : ''}
      </div>
    `;
  }
}

window.CardRenderer = CardRenderer;
