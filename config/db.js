const dns = require('dns');
const mongoose = require('mongoose');

let isConnected = false;

async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/uno_game';

  // Fix for Node.js SRV resolution on Windows
  if (uri.startsWith('mongodb+srv://')) {
    try {
      dns.setServers(['8.8.8.8', '1.1.1.1']);
    } catch (e) {}
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 8000
    });
    isConnected = true;
    console.log(`====================================================`);
    console.log(`🍃 MONGODB CONNECTED: ${conn.connection.host}/${conn.connection.name}`);
    console.log(`====================================================`);
    return true;
  } catch (err) {
    isConnected = false;
    console.warn(`====================================================`);
    console.warn(`⚠️  MONGODB NOT CONNECTED (${err.message})`);
    console.warn(`👉 The server is running in GUEST / OFFLINE AUTH mode.`);
    console.warn(`👉 To connect MongoDB, set MONGODB_URI in your .env file.`);
    console.warn(`====================================================`);
    return false;
  }
}

function getDbStatus() {
  return {
    isConnected,
    readyState: mongoose.connection.readyState
  };
}

module.exports = {
  connectDB,
  getDbStatus
};
