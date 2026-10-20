const dns = require('dns');
const mongoose = require('mongoose');

let isConnected = false;
let lastDbError = null;
let isConnecting = false;

// Monitor connection events
mongoose.connection.on('connected', () => {
  isConnected = true;
  lastDbError = null;
});

mongoose.connection.on('disconnected', () => {
  isConnected = false;
});

mongoose.connection.on('error', (err) => {
  isConnected = false;
  lastDbError = err.message;
});

async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    isConnected = false;
    lastDbError = 'MONGODB_URI environment variable is not configured';
    return false;
  }

  // If already connected, no-op
  if (mongoose.connection.readyState === 1) {
    isConnected = true;
    lastDbError = null;
    return true;
  }

  // Prevent overlapping concurrent connection attempts
  if (isConnecting) return false;
  isConnecting = true;

  // Fix for Node.js SRV resolution on Windows local environments
  if (process.platform === 'win32' && uri.startsWith('mongodb+srv://')) {
    try {
      dns.setServers(['8.8.8.8', '1.1.1.1']);
    } catch (e) {}
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 8000
    });
    isConnected = true;
    lastDbError = null;
    console.log(`====================================================`);
    console.log(`🍃 MONGODB CONNECTED: ${conn.connection.host}/${conn.connection.name}`);
    console.log(`====================================================`);
    return true;
  } catch (err) {
    isConnected = false;
    lastDbError = err.message;
    console.warn(`====================================================`);
    console.warn(`⚠️  MONGODB NOT CONNECTED (${err.message})`);
    console.warn(`👉 The server is running in GUEST / OFFLINE AUTH mode.`);
    console.warn(`====================================================`);
    return false;
  } finally {
    isConnecting = false;
  }
}

function getDbStatus() {
  return {
    isConnected: mongoose.connection.readyState === 1 || isConnected,
    hasMongoUri: Boolean(process.env.MONGODB_URI),
    lastError: lastDbError,
    readyState: mongoose.connection.readyState
  };
}

module.exports = {
  connectDB,
  getDbStatus
};
