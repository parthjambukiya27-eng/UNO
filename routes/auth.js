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
    const { isConnected } = await ensureDb();

    if (isConnected) {
      const user = await User.findOne({ username: cleanUsername });
      if (user) {
        user.stats.gamesPlayed += 1;
        if (won) {
          user.stats.wins += 1;
        } else {
          user.stats.losses += 1;
        }
        user.stats.totalScore += (score || 0);
        await user.save();
        return res.json({ success: true, stats: user.stats });
      }
    } else {
      const stored = memoryUsers.get(cleanUsername);
      if (stored) {
        stored.stats.gamesPlayed += 1;
        if (won) stored.stats.wins += 1;
        else stored.stats.losses += 1;
        stored.stats.totalScore += (score || 0);
        return res.json({ success: true, stats: stored.stats });
      }
    }

    res.json({ success: false, message: 'User not found' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
