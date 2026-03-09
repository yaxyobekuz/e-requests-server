const { Router } = require("express");
const { getSettings, updateSettings } = require("../controllers/settings.controller");
const { protect, authorize } = require("../middlewares/auth.middleware");

const router = Router();

// Owner va admin o'qiy oladi (badge ko'rsatish uchun kerak)
router.get("/", protect, authorize("owner", "admin"), getSettings);

// Faqat owner o'zgartira oladi
router.put("/", protect, authorize("owner"), updateSettings);

module.exports = router;
