// UNO Card Definitions and Deck Engine

const COLORS = ['red', 'blue', 'green', 'yellow'];
const VALUES = [
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  'skip', 'reverse', 'draw2'
];
const WILD_VALUES = ['wild', 'wild4'];

class Card {
  constructor(id, color, value) {
    this.id = id;          // Unique ID for each card instance
    this.color = color;    // 'red' | 'blue' | 'green' | 'yellow' | 'wild'
    this.value = value;    // '0'-'9' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4'
  }

  isWild() {
    return this.color === 'wild';
  }

  getScoreValue() {
    if (this.value === 'wild' || this.value === 'wild4') return 50;
    if (this.value === 'skip' || this.value === 'reverse' || this.value === 'draw2') return 20;
    return parseInt(this.value, 10) || 0;
  }
}

class Deck {
  constructor() {
    this.cards = [];
    this.reset();
  }

  // Generates official 108-card UNO deck
  reset() {
    this.cards = [];
    let idCounter = 1;

    COLORS.forEach(color => {
      // One '0' card per color
      this.cards.push(new Card(`card_${idCounter++}`, color, '0'));

      // Two cards of 1-9, skip, reverse, draw2 per color
      const repeatableValues = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2'];
      repeatableValues.forEach(val => {
        this.cards.push(new Card(`card_${idCounter++}`, color, val));
        this.cards.push(new Card(`card_${idCounter++}`, color, val));
      });
    });

    // 4 Wild cards
    for (let i = 0; i < 4; i++) {
      this.cards.push(new Card(`card_${idCounter++}`, 'wild', 'wild'));
    }

    // 4 Wild Draw Four cards
    for (let i = 0; i < 4; i++) {
      this.cards.push(new Card(`card_${idCounter++}`, 'wild', 'wild4'));
    }

    this.shuffle();
  }

  // Modern Fisher-Yates shuffle
  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  draw() {
    return this.cards.pop();
  }

  drawMultiple(count) {
    const drawn = [];
    for (let i = 0; i < count; i++) {
      const card = this.draw();
      if (card) drawn.push(card);
    }
    return drawn;
  }

  count() {
    return this.cards.length;
  }

  insertCards(cards) {
    this.cards.push(...cards);
    this.shuffle();
  }
}

module.exports = { Card, Deck, COLORS, VALUES, WILD_VALUES };
