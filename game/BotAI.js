// UNO Bot AI Engine with strategic card selection and human-like timing

class BotAI {
  static getPlayableCards(hand, topCard, activeColor, stackedDrawCount = 0, houseRules = {}) {
    return hand.filter(card => {
      // If there is an active stacking penalty (+2 or +4)
      if (stackedDrawCount > 0 && houseRules.stacking) {
        if (topCard.value === 'draw2') {
          return card.value === 'draw2' || (houseRules.stackDraw4On2 && card.value === 'wild4');
        }
        if (topCard.value === 'wild4') {
          return card.value === 'wild4';
        }
      }

      // Wild cards can always be legally played
      if (card.color === 'wild') return true;

      // Color match
      if (card.color === activeColor) return true;

      // Number or action symbol match
      if (card.value === topCard.value) return true;

      return false;
    });
  }

  // Choose the best card to play from hand
  static selectBestCard(hand, topCard, activeColor, opponents = [], stackedDrawCount = 0, houseRules = {}) {
    const playable = this.getPlayableCards(hand, topCard, activeColor, stackedDrawCount, houseRules);
    if (playable.length === 0) return null;

    // Check if next player has few cards (e.g. <= 2 cards) - aggressively use attacks!
    const nextOpponent = opponents[0];
    const isNextThreatening = nextOpponent && nextOpponent.cardCount <= 2;

    if (isNextThreatening) {
      // Prioritize +4, +2, Skip, Reverse
      const attackCard = playable.find(c => c.value === 'wild4' || c.value === 'draw2' || c.value === 'skip' || c.value === 'reverse');
      if (attackCard) return attackCard;
    }

    // Prefer playing cards matching the color we have the most of
    const colorCounts = this.getColorCounts(hand);
    
    // Sort playable cards by:
    // 1. Matching our strongest color
    // 2. Getting rid of high-point non-wild cards (action cards = 20 pts)
    // 3. Saving Wild cards for when we really need them
    playable.sort((a, b) => {
      // De-prioritize wild cards unless necessary or running out of cards
      if (a.color === 'wild' && b.color !== 'wild') return 1;
      if (b.color === 'wild' && a.color !== 'wild') return -1;

      // Prefer color with most cards in hand
      const aColorWeight = colorCounts[a.color] || 0;
      const bColorWeight = colorCounts[b.color] || 0;
      if (aColorWeight !== bColorWeight) {
        return bColorWeight - aColorWeight;
      }

      // Then prefer higher point cards
      return b.getScoreValue() - a.getScoreValue();
    });

    return playable[0];
  }

  // Determine which color to declare when playing a Wild
  static chooseWildColor(hand) {
    const counts = this.getColorCounts(hand);
    let bestColor = 'red';
    let maxCount = -1;

    ['red', 'blue', 'green', 'yellow'].forEach(color => {
      const count = counts[color] || 0;
      if (count > maxCount) {
        maxCount = count;
        bestColor = color;
      }
    });

    return bestColor;
  }

  static getColorCounts(hand) {
    const counts = { red: 0, blue: 0, green: 0, yellow: 0 };
    hand.forEach(c => {
      if (counts[c.color] !== undefined) {
        counts[c.color]++;
      }
    });
    return counts;
  }

  // Decide whether to challenge a Wild Draw 4
  static shouldChallenge(targetCardCount) {
    // If target has many cards (6+), probability they had another matching color is higher
    return targetCardCount >= 5 && Math.random() < 0.45;
  }
}

module.exports = BotAI;
