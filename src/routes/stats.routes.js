const router = require("express").Router();
const { getDashboard, getByRegion } = require("../controllers/stats.controller");
const { protect, authorize } = require("../middlewares/auth.middleware");

router.get("/dashboard", protect, authorize("owner", "admin"), getDashboard);
router.get("/by-region", protect, authorize("owner", "admin"), getByRegion);

module.exports = router;
