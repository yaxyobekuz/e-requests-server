const variables = {
  // Server Settings
  PORT: process.env.PORT || 4040,
  NODE_ENV: process.env.NODE_ENV || "development",

  // Database Settings
  MONGODB_URI:
    process.env.MONGODB_URI || "mongodb://localhost:27017/e-requests",

  // JWT Settings
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "30d",

  // Owner Account Settings
  OWNER_USERNAME: process.env.OWNER_USERNAME || "admin",
  OWNER_PASSWORD: process.env.OWNER_PASSWORD,
  OWNER_FIRSTNAME: process.env.OWNER_FIRSTNAME || "Admin",

  // Telegram Bot Settings
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  MESSAGE_RATE_LIMIT_MS: Number(process.env.MESSAGE_RATE_LIMIT_MS) || 1000,
};

module.exports = variables;
