// Visual Effects (VFX) Engine: Particles, Confetti, Seat Action Badges, Screen Shake, and Floating Reactions

class UnoVFX {
  static triggerActionBadge(playerId, type, extraText = '') {
    const overlay = document.getElementById(`action-overlay-${playerId}`);
    if (!overlay) return;

    overlay.innerHTML = '';
    const badge = document.createElement('div');
    badge.className = `action-anim-badge badge-${type.toLowerCase()}`;

    let icon = '';
    let label = '';

    switch (type) {
      case 'DRAW2':
      case 'DRAW2_STACK':
        icon = '+2';
        label = extraText || '+2 CARDS!';
        badge.classList.add('badge-plus2');
        break;
      case 'WILD4':
      case 'WILD4_STACK':
        icon = '+4';
        label = extraText || '+4 CARDS!';
        badge.classList.add('badge-plus4');
        this.shakeScreen();
        break;
      case 'SKIP':
        icon = '⊘';
        label = 'SKIPPED!';
        badge.classList.add('badge-skip');
        break;
      case 'REVERSE':
        icon = '⇄';
        label = 'REVERSED!';
        badge.classList.add('badge-reverse');
        break;
      case 'UNO':
        icon = '📢';
        label = 'UNO!';
        badge.classList.add('badge-uno');
        break;
      case 'CAUGHT':
        icon = '🚨';
        label = 'CAUGHT! +2';
        badge.classList.add('badge-caught');
        break;
      default:
        icon = '★';
        label = extraText || type;
        break;
    }

    badge.innerHTML = `
      <div class="anim-icon">${icon}</div>
      <div class="anim-label">${label}</div>
    `;

    overlay.appendChild(badge);

    // Remove badge after animation completes
    setTimeout(() => {
      badge.remove();
    }, 2200);
  }

  static shakeScreen(duration = 450) {
    const arena = document.querySelector('.game-arena') || document.body;
    arena.classList.add('screen-shake');
    setTimeout(() => {
      arena.classList.remove('screen-shake');
    }, duration);
  }

  static triggerConfetti() {
    const container = document.getElementById('vfx-container') || document.body;
    const colors = ['#ef233c', '#0077b6', '#2ec4b6', '#ffb703', '#ffffff', '#9d4edd'];
    const count = 75;

    for (let i = 0; i < count; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      piece.style.left = `${Math.random() * 100}vw`;
      piece.style.top = `-20px`;
      piece.style.width = `${8 + Math.random() * 10}px`;
      piece.style.height = `${10 + Math.random() * 14}px`;
      piece.style.animationDuration = `${2 + Math.random() * 2.5}s`;
      piece.style.animationDelay = `${Math.random() * 0.4}s`;
      piece.style.transform = `rotate(${Math.random() * 360}deg)`;

      container.appendChild(piece);
      setTimeout(() => piece.remove(), 4500);
    }
  }

  static floatReaction(emoji, startEl = null) {
    const container = document.getElementById('vfx-container') || document.body;
    const el = document.createElement('div');
    el.className = 'floating-emoji';
    el.textContent = emoji;

    if (startEl) {
      const rect = startEl.getBoundingClientRect();
      el.style.left = `${rect.left + rect.width / 2}px`;
      el.style.top = `${rect.top}px`;
    } else {
      el.style.left = `${30 + Math.random() * 40}vw`;
      el.style.top = `60vh`;
    }

    container.appendChild(el);
    setTimeout(() => el.remove(), 2500);
  }

  static flashColorWave(color) {
    const wave = document.createElement('div');
    wave.className = `color-wave-flash wave-${color}`;
    document.body.appendChild(wave);
    setTimeout(() => wave.remove(), 800);
  }
}

window.UnoVFX = UnoVFX;
