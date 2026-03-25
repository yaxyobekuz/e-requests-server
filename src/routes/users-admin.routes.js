const router = require("express").Router();
const { getAll, getStats } = require("../controllers/users-admin.controller");
const { protect, authorize } = require("../middlewares/auth.middleware");

// /stats /:id dan OLDIN bo'lishi shart
router.get("/stats", protect, authorize("owner", "admin"), getStats);
router.get("/", protect, authorize("owner", "admin"), getAll);

module.exports = router;
