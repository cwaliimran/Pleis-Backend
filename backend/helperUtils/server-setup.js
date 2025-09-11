const mongoose = require("mongoose");
require('dotenv').config({ path: `.env.${process.env.NODE_ENV || 'dev'}` });

const PORT = process.env.PORT || 4014; // 4014 only for local testing

const startServer = (app) => {
  app.listen(PORT, () => {
    logger.log("🚀 Server is running on port", PORT);
  });
};

const connectToDB = async (app, retries = 5, delay = 3000) => {
  const uri = process.env.BASE_URL;
  if (!uri) {
    throw new Error("MongoDB URI not found in environment variables");
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(uri);
      startServer(app);
      return;
    } catch (error) {
      console.error(`Failed to connect to MongoDB (attempt ${attempt} of ${retries}):`, error);
      if (attempt < retries) {
        await new Promise(res => setTimeout(res, delay));
        logger.log(`Retrying to connect in ${delay / 1000} seconds...`);
      } else {
        console.error("All attempts to connect to MongoDB failed. Exiting.");
        process.exit(1);
      }
    }
  }
};

module.exports = connectToDB;
