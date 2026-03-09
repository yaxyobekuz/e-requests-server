const mongoose = require("mongoose");

/**
 * Tizim sozlamalari — singleton pattern (bazada faqat bitta hujjat).
 * findOneAndUpdate({}, ..., { upsert: true }) orqali boshqariladi.
 */
const settingsSchema = new mongoose.Schema(
  {
    deadlineDays: {
      type: Number,
      default: 15,
      min: 1,
      max: 365,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Settings", settingsSchema);
