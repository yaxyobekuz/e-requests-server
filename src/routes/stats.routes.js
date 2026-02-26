const router = require("express").Router();
const {
  getDashboard,
  getByRegion,
  getComprehensive,
  getTrends,
  getRegionalDetailed,
} = require("../controllers/stats.controller");
const { protect, authorize } = require("../middlewares/auth.middleware");

router.get("/dashboard",          protect, authorize("owner", "admin"), getDashboard);
router.get("/by-region",          protect, authorize("owner", "admin"), getByRegion);
router.get("/comprehensive",      protect, authorize("owner", "admin"), getComprehensive);
router.get("/trends",             protect, authorize("owner", "admin"), getTrends);
router.get("/by-region/detailed", protect, authorize("owner", "admin"), getRegionalDetailed);

module.exports = router;
