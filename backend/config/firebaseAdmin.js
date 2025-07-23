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

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://pleis-50810.firebaseio.com",
});

module.exports = admin;

