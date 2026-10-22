const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { connectDB, getDbStatus } = require('../config/db');

// In-memory fallback if MongoDB is not running yet
const memoryUsers = new Map();

// Helper to ensure MongoDB connection is active if URI is available
async function ensureDb() {
  let db = getDbStatus();
  if (!db.isConnected && process.env.MONGODB_URI) {
    await connectDB();
    db = getDbStatus();
  }
  return db;
}

// Check DB & Auth Status with live diagnostic details
router.get('/status', async (req, res) => {
  const db = await ensureDb();
  res.json({
    database: db.isConnected ? 'connected' : 'offline',
    hasMongoUri: db.hasMongoUri,
    lastError: db.lastError || null,
    message: db.isConnected
      ? 'MongoDB connected'
      : (db.hasMongoUri ? `MongoDB offline: ${db.lastError}` : 'MONGODB_URI not set on server - fallback guest mode active')
  });
});

// Register
router.post('/register', async (req, res) => {
  try {
    const { username, password, avatar } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const cleanUsername = username.trim().toLowerCase();
    if (cleanUsername.length < 3 || cleanUsername.length > 20) {
      return res.status(400).json({ error: 'Username must be between 3 and 20 characters' });
    }

    if (password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }

    const { isConnected } = await ensureDb();

    if (isConnected) {
      const existing = await User.findOne({ username: cleanUsername });
      if (existing) {
        return res.status(409).json({ error: 'Username is already taken' });
      }

      const user = new User({
        username: cleanUsername,
        displayName: username.trim(),
        password,
        avatar: avatar || '😎'
      });

      await user.save();
      return res.status(201).json({
        success: true,
        user: user.toSafeObject()
      });
    } else {
      // In-memory fallback
      if (memoryUsers.has(cleanUsername)) {
        return res.status(409).json({ error: 'Username is already taken (Guest store)' });
      }

      const mockUser = {
        id: 'mem_' + Date.now(),
        username: cleanUsername,
        displayName: username.trim(),
        avatar: avatar || '😎',
        stats: { gamesPlayed: 0, wins: 0, losses: 0, totalScore: 0 },
        createdAt: new Date()
      };
      memoryUsers.set(cleanUsername, { ...mockUser, password });

      return res.status(201).json({
        success: true,
        user: mockUser,
        notice: 'Saved in offline memory (Connect MongoDB to persist permanently).'
      });
    }
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Failed to create account: ' + err.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const cleanUsername = username.trim().toLowerCase();
    const { isConnected } = await ensureDb();

    if (isConnected) {
      const user = await User.findOne({ username: cleanUsername });
      if (!user) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      user.lastLogin = new Date();
      await user.save();

      return res.json({
        success: true,
        user: user.toSafeObject()
      });
    } else {
      // In-memory fallback
      const stored = memoryUsers.get(cleanUsername);
      if (!stored || stored.password !== password) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      const { password: _, ...safeUser } = stored;
      return res.json({
        success: true,
        user: safeUser
      });
    }
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Failed to log in: ' + err.message });
  }
});

// Update match stats after a game completes
router.post('/record-game', async (req, res) => {
  try {
    const { username, won, score } = req.body;
    if (!username) return res.status(400).json({ error: 'Username required' });

    const cleanUsername = username.trim().toLowerCase();
    const isWon = Boolean(won === true || won === 'true' || won === 1 || won === '1');
    const points = Math.max(0, parseInt(score, 10) || 0);
    const { isConnected } = await ensureDb();

    if (isConnected) {
      const user = await User.findOne({ username: cleanUsername });
      if (user) {
        user.stats.gamesPlayed += 1;
        if (isWon) {
          user.stats.wins += 1;
        } else {
          user.stats.losses += 1;
        }
        user.stats.totalScore += points;
        await user.save();
        return res.json({ success: true, stats: user.stats });
      }
    } else {
      const stored = memoryUsers.get(cleanUsername);
      if (stored) {
        stored.stats.gamesPlayed += 1;
        if (isWon) stored.stats.wins += 1;
        else stored.stats.losses += 1;
        stored.stats.totalScore += points;
        return res.json({ success: true, stats: stored.stats });
      }
    }

    res.json({ success: false, message: 'User not found' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Search registered users
router.get('/search-users', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const current = (req.query.current || '').trim().toLowerCase();
    if (!q || q.length < 2) {
      return res.json({ success: true, users: [] });
    }

    const { isConnected } = await ensureDb();
    let foundUsers = [];

    if (isConnected) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      const list = await User.find({
        $and: [
          { username: { $ne: current } },
          { $or: [{ username: regex }, { displayName: regex }] }
        ]
      })
      .select('username displayName avatar stats')
      .limit(10);

      foundUsers = list.map(u => ({
        username: u.username,
        displayName: u.displayName || u.username,
        avatar: u.avatar || '😎',
        wins: u.stats?.wins || 0,
        totalScore: u.stats?.totalScore || 0
      }));
    } else {
      for (const [key, val] of memoryUsers.entries()) {
        if (key === current) continue;
        if (key.includes(q.toLowerCase()) || (val.displayName || '').toLowerCase().includes(q.toLowerCase())) {
          foundUsers.push({
            username: val.username,
            displayName: val.displayName || val.username,
            avatar: val.avatar || '😎',
            wins: val.stats?.wins || 0,
            totalScore: val.stats?.totalScore || 0
          });
          if (foundUsers.length >= 10) break;
        }
      }
    }

    res.json({ success: true, users: foundUsers });
  } catch (err) {
    console.error('Search users error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Add friend (mutual / bilateral)
router.post('/add-friend', async (req, res) => {
  try {
    const username = req.body.username || req.body.currentUsername;
    const { friendUsername } = req.body;
    if (!username || !friendUsername) {
      return res.status(400).json({ error: 'Username and friendUsername required' });
    }

    const uClean = username.trim().toLowerCase();
    const fClean = friendUsername.trim().toLowerCase();

    if (uClean === fClean) {
      return res.status(400).json({ error: 'Cannot add yourself as a friend' });
    }

    const { isConnected } = await ensureDb();

    if (isConnected) {
      const user = await User.findOne({ username: uClean });
      const friend = await User.findOne({ username: fClean });

      if (!user) return res.status(404).json({ error: 'User not found' });
      if (!friend) return res.status(404).json({ error: 'User not found' });

      // Check if already friends
      const already = user.friends.some(f => f.username.toLowerCase() === fClean);
      if (!already) {
        user.friends.push({
          username: friend.username,
          displayName: friend.displayName || friend.username,
          avatar: friend.avatar || '😎'
        });
        await user.save();
      }

      const friendAlready = friend.friends.some(f => f.username.toLowerCase() === uClean);
      if (!friendAlready) {
        friend.friends.push({
          username: user.username,
          displayName: user.displayName || user.username,
          avatar: user.avatar || '😎'
        });
        await friend.save();
      }

      return res.json({ success: true, friends: user.friends, message: `Added ${friend.displayName || friend.username} as friend!` });
    } else {
      const user = memoryUsers.get(uClean);
      const friend = memoryUsers.get(fClean);

      if (!user || !friend) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (!user.friends) user.friends = [];
      if (!friend.friends) friend.friends = [];

      if (!user.friends.some(f => f.username === fClean)) {
        user.friends.push({
          username: friend.username,
          displayName: friend.displayName || friend.username,
          avatar: friend.avatar || '😎'
        });
      }

      if (!friend.friends.some(f => f.username === uClean)) {
        friend.friends.push({
          username: user.username,
          displayName: user.displayName || user.username,
          avatar: user.avatar || '😎'
        });
      }

      return res.json({ success: true, friends: user.friends, message: `Added ${friend.displayName || friend.username} as friend!` });
    }
  } catch (err) {
    console.error('Add friend error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Remove friend
router.post('/remove-friend', async (req, res) => {
  try {
    const username = req.body.username || req.body.currentUsername;
    const { friendUsername } = req.body;
    if (!username || !friendUsername) {
      return res.status(400).json({ error: 'Username and friendUsername required' });
    }

    const uClean = username.trim().toLowerCase();
    const fClean = friendUsername.trim().toLowerCase();
    const { isConnected } = await ensureDb();

    if (isConnected) {
      const user = await User.findOne({ username: uClean });
      if (user) {
        user.friends = user.friends.filter(f => f.username.toLowerCase() !== fClean);
        await user.save();
      }
      const friend = await User.findOne({ username: fClean });
      if (friend) {
        friend.friends = friend.friends.filter(f => f.username.toLowerCase() !== uClean);
        await friend.save();
      }
      return res.json({ success: true, friends: user ? user.friends : [] });
    } else {
      const user = memoryUsers.get(uClean);
      if (user && user.friends) {
        user.friends = user.friends.filter(f => f.username.toLowerCase() !== fClean);
      }
      const friend = memoryUsers.get(fClean);
      if (friend && friend.friends) {
        friend.friends = friend.friends.filter(f => f.username.toLowerCase() !== uClean);
      }
      return res.json({ success: true, friends: user ? user.friends : [] });
    }
  } catch (err) {
    console.error('Remove friend error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get user friends with latest stats
router.get('/friends', async (req, res) => {
  try {
    const username = (req.query.username || '').trim().toLowerCase();
    if (!username) return res.status(400).json({ error: 'Username required' });

    const { isConnected } = await ensureDb();

    if (isConnected) {
      const user = await User.findOne({ username });
      if (!user) return res.status(404).json({ error: 'User not found' });

      const friendUsernames = (user.friends || []).map(f => f.username.toLowerCase());
      const friendDocs = await User.find({ username: { $in: friendUsernames } })
        .select('username displayName avatar stats');

      const docMap = new Map();
      friendDocs.forEach(d => docMap.set(d.username.toLowerCase(), d));

      const enriched = (user.friends || []).map(f => {
        const doc = docMap.get(f.username.toLowerCase());
        return {
          username: f.username,
          displayName: doc ? (doc.displayName || doc.username) : (f.displayName || f.username),
          avatar: doc ? doc.avatar : f.avatar,
          stats: doc ? doc.stats : { gamesPlayed: 0, wins: 0, losses: 0, totalScore: 0 }
        };
      });

      return res.json({ success: true, friends: enriched });
    } else {
      const user = memoryUsers.get(username);
      if (!user) return res.status(404).json({ error: 'User not found' });
      return res.json({ success: true, friends: user.friends || [] });
    }
  } catch (err) {
    console.error('Get friends error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

