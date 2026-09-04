const admin = require("firebase-admin");
const fs = require('fs');
const path = require('path');

const folderPath = path.join(__dirname, '../secretAssets');
const filePath = path.join(folderPath, 'serviceAccountKey.json');

// Create folder if it doesn't exist
if (!fs.existsSync(folderPath)) {
  fs.mkdirSync(folderPath, { recursive: true });
}

// Create file if it doesn't exist
if (!fs.existsSync(filePath)) {
  fs.writeFileSync(filePath, '{}'); // Creates an empty JSON file
}

const serviceAccount = require("../secretAssets/serviceAccountKey.json");

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://pleis-4fb7b.firebaseio.com",
  });

  // Log after successful initialization
  console.log('Firebase Admin SDK initialized successfully.');
} catch (error) {
  // Log any errors during initialization
  console.error('❌ Error initializing Firebase Admin SDK!');
}

function isFirebaseTransientNetworkError(err) {
  const msg = String(err?.message || err || "");
  const code = String(err?.code || "");
  return (
    code === "app/network-error" ||
    msg.includes("Error while making requests") ||
    msg.includes("Client network socket disconnected before secure TLS") ||
    msg.includes("ECONNRESET") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("socket hang up")
  );
}

module.exports = admin;
module.exports.isFirebaseTransientNetworkError = isFirebaseTransientNetworkError;

