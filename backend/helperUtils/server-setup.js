// helperUtils/server-setup.js
const mongoose = require("mongoose");

const connectToDB = async (server, retries = 5, delay = 3000) => {
  const uri = process.env.BASE_URL;
  if (!uri) throw new Error("MongoDB URI not found");

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(uri);

      server.listen(process.env.PORT || 4014, () => {
        logger.log(
          "🚀 API + Socket server running on port",
          process.env.PORT || 4014
        );
      });

      return;
    } catch (err) {
      console.error(`MongoDB connect failed (${attempt}/${retries})`, err);
      if (attempt === retries) process.exit(1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
};

module.exports = connectToDB;
