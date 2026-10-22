const BASE_URL = 'http://localhost:3000';

async function testWinSystem() {
  console.log('🏆 Testing Win Recording System...');

  // 1. Register test player
  const testUsername = `w_${Date.now().toString().slice(-8)}`;
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: testUsername,
      displayName: 'Winner Tester',
      password: 'password123'
    })
  });
  const regData = await regRes.json();
  if (!regData.success) throw new Error('Registration failed: ' + regData.error);

  const initialWins = regData.user.stats.wins;
  const initialScore = regData.user.stats.totalScore;
  const initialGames = regData.user.stats.gamesPlayed;

  console.log(`Initial Stats - Wins: ${initialWins}, Score: ${initialScore}, Games: ${initialGames}`);

  // 2. Record Win with 85 points
  console.log('\nRecording Game Win (won = true, score = 85)...');
  const recordRes = await fetch(`${BASE_URL}/api/auth/record-game`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: testUsername,
      won: true,
      score: 85
    })
  });
  const recordData = await recordRes.json();
  if (!recordData.success) throw new Error('Record game failed: ' + recordData.error);

  const updatedWins = recordData.stats.wins;
  const updatedScore = recordData.stats.totalScore;
  const updatedGames = recordData.stats.gamesPlayed;

  console.log(`Updated Stats - Wins: ${updatedWins}, Score: ${updatedScore}, Games: ${updatedGames}`);

  if (updatedWins !== initialWins + 1) {
    throw new Error(`Expected wins to be ${initialWins + 1}, got ${updatedWins}`);
  }
  if (updatedScore !== initialScore + 85) {
    throw new Error(`Expected score to be ${initialScore + 85}, got ${updatedScore}`);
  }
  if (updatedGames !== initialGames + 1) {
    throw new Error(`Expected gamesPlayed to be ${initialGames + 1}, got ${updatedGames}`);
  }

  // 3. Record Loss with 0 points
  console.log('\nRecording Game Loss (won = false, score = 0)...');
  const lossRes = await fetch(`${BASE_URL}/api/auth/record-game`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: testUsername,
      won: false,
      score: 0
    })
  });
  const lossData = await lossRes.json();
  if (!lossData.success) throw new Error('Loss record failed: ' + lossData.error);

  if (lossData.stats.wins !== updatedWins) {
    throw new Error(`Wins should not change on loss`);
  }
  if (lossData.stats.losses !== 1) {
    throw new Error(`Losses should increment to 1`);
  }
  if (lossData.stats.gamesPlayed !== updatedGames + 1) {
    throw new Error(`Games played should increment`);
  }

  console.log('✅ WIN SYSTEM AND STATS TRACKING FULLY VERIFIED!\n');
  process.exit(0);
}

testWinSystem().catch(err => {
  console.error('❌ WIN SYSTEM TEST FAILED:', err);
  process.exit(1);
});
