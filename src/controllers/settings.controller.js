const Settings = require("../models/settings.model");

/**
 * Tizim sozlamalarini qaytaradi.
 * Agar hujjat mavjud bo'lmasa standart qiymatlarni qaytaradi.
 * @route GET /api/settings
 */
const getSettings = async (req, res) => {
  try {
    const settings = await Settings.findOne();
    if (!settings) {
      return res.json({ deadlineDays: 15 });
    }
    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/**
 * Tizim sozlamalarini yangilaydi (faqat owner).
 * @route PUT /api/settings
 * @param {number} req.body.deadlineDays - Ijro muddati (1–365 kun)
 */
const updateSettings = async (req, res) => {
  try {
    const { deadlineDays } = req.body;

    if (
      deadlineDays === undefined ||
      typeof deadlineDays !== "number" ||
      deadlineDays < 1 ||
      deadlineDays > 365
    ) {
      return res
        .status(400)
        .json({ message: "deadlineDays 1 dan 365 gacha bo'lishi kerak" });
    }

    const settings = await Settings.findOneAndUpdate(
      {},
      { deadlineDays },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

module.exports = { getSettings, updateSettings };
