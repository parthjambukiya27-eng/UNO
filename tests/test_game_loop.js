const io = require('../node_modules/socket.io/client-dist/socket.io.js');
const BASE_URL = 'http://localhost:3000';

async function testGameLoop() {
  console.log('🎮 Starting Full Game Loop Integration Test...');

  const p1 = io(BASE_URL, { transports: ['websocket'], reconnection: false });
  const p2 = io(BASE_URL, { transports: ['websocket'], reconnection: false });

  await Promise.all([
    new Promise(res => p1.on('connect', res)),
    new Promise(res => p2.on('connect', res))
  ]);

  console.log('Sockets connected:', p1.id, p2.id);

  // P1 creates room
  let roomCode = null;
  const createRes = await new Promise(res => {
    p1.emit('create_room', {
      playerName: 'Player 1',
      avatar: '🤠',
      settings: { maxPlayers: 4 }
    }, res);
  });

  if (!createRes.success) throw new Error('Create room failed: ' + createRes.error);
  roomCode = createRes.roomCode;
  console.log(`✅ Room created: ${roomCode}`);

  // P2 joins room
  const joinRes = await new Promise(res => {
    p2.emit('join_room', {
      roomCode: roomCode,
      playerName: 'Player 2',
      avatar: '🤖'
    }, res);
  });

  if (!joinRes.success) throw new Error('Join room failed: ' + joinRes.error);
  console.log(`✅ Player 2 joined room ${roomCode}`);

  // P1 starts game
  let p1State = null;
  let p2State = null;

  const startPromise = Promise.all([
    new Promise(res => {
      p1.on('game_update', state => {
        if (state.status === 'in_progress') {
          p1State = state;
          res(state);
        }
      });
    }),
    new Promise(res => {
      p2.on('game_update', state => {
        if (state.status === 'in_progress') {
          p2State = state;
          res(state);
        }
      });
    })
  ]);

  p1.emit('start_game', { roomCode });
  await startPromise;

  console.log('✅ Game started!');
  console.log(`Deck count: ${p1State.deckCount}, Top card: ${p1State.topCard.color} ${p1State.topCard.value}`);
  console.log(`P1 hand size: ${p1State.myHand.length}, P2 hand size: ${p2State.myHand.length}`);

  if (p1State.myHand.length !== 7 || p2State.myHand.length !== 7) {
    throw new Error('Initial hand size is not 7');
  }

  // Determine current turn
  const turnPlayerId = p1State.currentTurnPlayerId;
  const currentSocket = (turnPlayerId === p1State.myId) ? p1 : p2;
  const currentState = (turnPlayerId === p1State.myId) ? p1State : p2State;
  const playerName = (turnPlayerId === p1State.myId) ? 'Player 1' : 'Player 2';

  console.log(`\nTurn is with: ${playerName}`);

  // Find a playable card or draw
  let playableCard = currentState.myHand.find(c => 
    c.color === currentState.topCard.color || 
    c.value === currentState.topCard.value || 
    c.color === 'wild'
  );

  if (playableCard) {
    console.log(`Playing card: ${playableCard.color} ${playableCard.value}`);
    const playRes = await new Promise(res => {
      currentSocket.emit('play_card', {
        cardId: playableCard.id,
        chosenColor: playableCard.color === 'wild' ? 'red' : null
      }, res);
    });
    console.log('Play card response success:', playRes?.success);
  } else {
    console.log('No playable card in hand, drawing a card...');
    const drawRes = await new Promise(res => {
      currentSocket.emit('draw_card', {}, res);
    });
    console.log('Draw card response success:', drawRes?.success);
  }

  p1.disconnect();
  p2.disconnect();

  console.log('✅ FULL GAMEPLAY LOOP TEST COMPLETED SUCCESSFULLY!\n');
  process.exit(0);
}

testGameLoop().catch(err => {
  console.error('❌ GAME LOOP TEST FAILED:', err);
  process.exit(1);
});
