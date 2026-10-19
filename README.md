# 🃏 UNO Online - Real-Time Multi-Device Arcade

A high-definition, real-time multiplayer **UNO** game built for playing across phones, tablets, and laptops on the same Wi-Fi network, or playing solo against intelligent AI bots!

---

## 🌟 Key Features

### 1. Multi-Device Play (Phone, Tablet, Desktop)
- **Instant QR Code Join:** Host a game on your PC or tablet; friends can point their phone camera at the screen to join the room in seconds!
- **Local Network Auto-Detection:** Automatically detects your Wi-Fi IP address (e.g., `http://192.168.x.x:3000`) so everyone on the same network can play without installing any apps.
- **Responsive Mobile Touch Interface:** Curved card fan hand, tap-to-play, drag-and-drop onto the center discard pile, and touch-optimized controls.

### 2. High-Definition Graphics & 3D Visuals
- **Authentic 3D UNO Cards:**
  - Classic tilted oval badge design with realistic specular gloss reflections.
  - Custom SVG iconography for **Skip (⊘)**, **Reverse (⇄)**, **Draw Two (+2)**, **Wild Color Wheel**, and **Wild Draw Four (+4)**.
  - Interactive hover/touch card elevation with playable card rhythmic pulse.
- **Virtual Felt Tabletop:**
  - 3D perspective felt gaming table with perimeter LED border that dynamically reacts to the current play color (Crimson Red, Electric Blue, Emerald Green, Golden Yellow).
  - Orbiting glowing directional arrows that rotate clockwise or counter-clockwise based on active play direction.
  - Realistic discard pile simulation with stacked depth and random slight card rotation.

### 3. Dynamic Player Name Cards & Action Overlays
- **Player Seat Badges:**
  - Real-time seat badges showing player avatars, names, card counts, host badges, and turn timer pulse rings.
  - **Explosive Action Animations:**
    - **+2 Cards:** Explosive crimson red badge zooms onto the attacked player's seat.
    - **+4 Cards:** Giant neon shockwave with screen shake effect.
    - **⇄ Reverse:** Looping aerodynamic double arrows with blue sweep glow.
    - **⊘ Skip:** High-contrast red stamp effect.
    - **📢 UNO Shout:** Golden flame badge and triumphant brass fanfare.
    - **🚨 Catch UNO:** Warning siren badge when an opponent is caught not saying UNO!

### 4. Procedural Web Audio Sound Engine
- 100% self-contained Web Audio API synthesizer (no external audio files or 404s!):
  - Card snap onto felt table
  - Card draw slide and flutter
  - Bass impact drop for attacks (+2 and +4)
  - Metallic skip gong
  - Reverse stereo whoosh
  - Triumphant brass fanfare for "UNO!"
  - Chime alert on your turn
  - Victory celebration fanfare
  - Optional ambient low-fi arcade synth soundtrack toggle

### 5. Official Mattel Rules + Popular House Rules
- **Standard 108-Card UNO Deck:**
  - 4 Colors (Red, Blue, Green, Yellow), numbers 0–9.
  - Action cards: Skip, Reverse, Draw 2 (+2).
  - Wild & Wild Draw 4 (+4).
  - 2-Player special rules: Reverse acts as a Skip.
- **Wild Draw 4 Challenge Mechanic:**
  - Victims can either accept the +4 cards or challenge!
  - If the attacker held a card matching the discard color before playing +4, the attacker was bluffing and draws 4 penalty cards!
  - If innocent, the challenger draws 6 cards (4 + 2 penalty)!
- **Toggleable House Rules:**
  - **Stacking:** Stack +2 on +2, +4 on +4 (and configurable +4 on +2) to pass the penalty!
  - **7-0 Rule:** Playing a 7 lets you swap hands with any player; playing a 0 rotates all player hands in the current direction of play.
  - **Jump-In:** Play an identical card (color AND number/symbol) instantly, even out of turn!
  - **Draw-to-Match:** Keep drawing until you get a playable card.

---

## 🚀 Quick Start Guide

### 1. Start the Game Server
From the project folder (`d:\UNO`), run:
```bash
npm start
```
*(or `node server.js`)*

The terminal will display:
```
====================================================
🃏 UNO REAL-TIME MULTIPLAYER SERVER RUNNING!
👉 Local:   http://localhost:3000
👉 Network: http://192.168.x.x:3000 (Any Phone/Device!)
====================================================
```

### 2. Playing on Multiple Devices
1. On your main screen (PC/Laptop/Tablet), open `http://localhost:3000`.
2. Click **Create Private Room** (or customize House Rules).
3. Friends on phones connected to the same Wi-Fi can:
   - **Scan the QR Code** displayed on the lobby screen, OR
   - Open the network URL (e.g. `http://192.168.x.x:3000`) and enter the 4-letter Room Code!
4. The host clicks **Start Game** once everyone has joined!

### 3. Playing Solo vs AI Bots
- Click **Solo Play vs AI Bots (Instant Match)** on the lobby screen to immediately launch into a fast 4-player game against intelligent computer bots!

---

## 📂 Project Architecture

```
d:\UNO\
├── package.json          # Dependencies (express, socket.io, qrcode, cors)
├── server.js             # Real-time WebSocket server, LAN IP detection, QR API
├── game/
│   ├── Deck.js           # 108-card deck generator, card models, Fisher-Yates shuffle
│   ├── UnoGame.js        # State machine, rules validation, action effects, scoring
│   └── BotAI.js          # Heuristic AI bot decision engine & human-like timing
└── public/
    ├── index.html        # Responsive UI, lobby, waiting room, table arena, modals
    ├── css/
    │   ├── style.css     # Glassmorphism, animations, felt table, player name cards
    │   └── cards.css     # 3D glossy UNO card styling, icons, and fanning layout
    └── js/
        ├── audio.js      # Procedural Web Audio synthesizer (SFX & music)
        ├── cardRenderer.js# SVG & HTML card and seat badge generator
        ├── vfx.js        # Confetti, screen shake, floating emoji reactions
        └── app.js        # Socket.io client, touch/drag-and-drop controls
```
