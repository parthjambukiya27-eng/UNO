const io = require('../node_modules/socket.io/client-dist/socket.io.js');

const BASE_URL = 'http://localhost:3000';

async function runTest() {
  console.log('🚀 Starting Friends System & Direct Join Integration Test...\n');

  // 1. Register or Login Alice & Bob
  console.log('--- Step 1: User Registration / Login ---');
  async function authUser(username, displayName, password) {
    const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, displayName, password })
    });
    const regData = await regRes.json();
    if (regData.success) {
      console.log(`Registered user: ${username}`);
      return regData.user;
    }
    const logRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const logData = await logRes.json();
    if (logData.success) {
      console.log(`Logged in existing user: ${username}`);
      return logData.user;
    }
    throw new Error(`Failed to auth ${username}: ${logData.error || regData.error}`);
  }

  const alice = await authUser('alice_tester', 'Alice Wonderland', 'secret123');
  const bob = await authUser('bob_tester', 'Bob The Builder', 'secret123');

  // 2. Search Users
  console.log('\n--- Step 2: Search Users ---');
  const searchRes = await fetch(`${BASE_URL}/api/auth/search-users?q=bob&currentUsername=alice_tester`);
  const searchData = await searchRes.json();
  console.log(`Search for "bob": found ${searchData.users.length} user(s).`);
  const bobFound = searchData.users.some(u => u.username === 'bob_tester');
  console.log(`Bob found in search results: ${bobFound ? '✅ YES' : '❌ NO'}`);
  if (!bobFound) throw new Error('Bob not found in user search');

  // 3. Add Friend
  console.log('\n--- Step 3: Add Friend ---');
  const addRes = await fetch(`${BASE_URL}/api/auth/add-friend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'alice_tester', friendUsername: 'bob_tester' })
  });
  const addData = await addRes.json();
  console.log('Add friend response:', addData.message || addData.error);

  // 4. Verify Friends List for both
  console.log('\n--- Step 4: Verify Bilateral Friends List ---');
  const aliceFriendsRes = await fetch(`${BASE_URL}/api/auth/friends?username=alice_tester`);
  const aliceFriendsData = await aliceFriendsRes.json();
  const aliceHasBob = aliceFriendsData.friends.some(f => f.username === 'bob_tester');
  console.log(`Alice has Bob as friend: ${aliceHasBob ? '✅ YES' : '❌ NO'}`);

  const bobFriendsRes = await fetch(`${BASE_URL}/api/auth/friends?username=bob_tester`);
  const bobFriendsData = await bobFriendsRes.json();
  const bobHasAlice = bobFriendsData.friends.some(f => f.username === 'alice_tester');
  console.log(`Bob has Alice as friend: ${bobHasAlice ? '✅ YES' : '❌ NO'}`);

  if (!aliceHasBob || !bobHasAlice) {
    throw new Error('Friendship not established mutually');
  }

  // 5. Test Real-time Sockets & Friend Game Direct Join
  console.log('\n--- Step 5: Real-time Socket Presence & Game Notification ---');
  
  const socketAlice = io(BASE_URL, { transports: ['websocket'], reconnection: false });
  const socketBob = io(BASE_URL, { transports: ['websocket'], reconnection: false });

  await new Promise((resolve) => {
    let connectedCount = 0;
    socketAlice.on('connect', () => {
      console.log('Socket Alice connected:', socketAlice.id);
      socketAlice.emit('user_online', { username: 'alice_tester', displayName: 'Alice' });
      connectedCount++;
      if (connectedCount === 2) resolve();
    });
    socketBob.on('connect', () => {
      console.log('Socket Bob connected:', socketBob.id);
      socketBob.emit('user_online', { username: 'bob_tester', displayName: 'Bob' });
      connectedCount++;
      if (connectedCount === 2) resolve();
    });
  });

  // Small delay for server online state registration
  await new Promise(r => setTimeout(r, 600));

  // Set up promise to listen for Bob receiving friend_game_created
  let receivedGameCreated = null;
  const gameCreatedPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for friend_game_created notification')), 12000);
    socketBob.on('friend_game_created', (data) => {
      clearTimeout(timeout);
      console.log('🎯 Bob received friend_game_created event! Data:', data);
      receivedGameCreated = data;
      resolve(data);
    });
  });

  // Alice creates a room
  console.log('\nAlice creating room...');
  let createdRoomCode = null;
  await new Promise((resolve) => {
    socketAlice.emit('create_room', {
      playerName: 'Alice',
      avatar: '👩',
      userId: alice._id,
      username: 'alice_tester',
      settings: { maxPlayers: 4 }
    }, (res) => {
      console.log('Room created by Alice:', res);
      createdRoomCode = res.roomCode;
      resolve(res);
    });
  });

  // Wait for Bob to receive the notification
  const notificationData = await gameCreatedPromise;
  console.log(`✅ Notification verified! Room code matches: ${notificationData.roomCode === createdRoomCode ? '✅ YES' : '❌ NO'}`);
  console.log(`Host verified: ${notificationData.hostUsername === 'alice_tester' ? '✅ YES' : '❌ NO'}`);

  // 6. Direct Join by Bob using the received Room Code!
  console.log('\n--- Step 6: Direct Join Game by Friend (Bob) ---');
  await new Promise((resolve, reject) => {
    socketBob.emit('join_room', {
      roomCode: notificationData.roomCode,
      playerName: 'Bob',
      avatar: '👨',
      userId: bob._id
    }, (res) => {
      console.log('Bob join_room response:', res);
      if (res && res.success) {
        console.log(`✅ Bob joined room ${notificationData.roomCode} directly!`);
        console.log(`Current players in room:`, res.gameState.players.map(p => p.name));
        resolve(res);
      } else {
        reject(new Error(`Failed to join room: ${res ? res.error : 'Unknown error'}`));
      }
    });
  });

  // Clean up sockets
  socketAlice.disconnect();
  socketBob.disconnect();

  console.log('\n🎉 ALL FRIENDS & DIRECT JOIN INTEGRATION TESTS PASSED SUCCESSFULLY! 🎉\n');
  process.exit(0);
}

runTest().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
