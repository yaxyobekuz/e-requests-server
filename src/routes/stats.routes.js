const router = require("express").Router();
const {
  getDashboard,
  getByRegion,
  getTrends,
  getRegionDetailed,
  getHeatmap,
  getByCategory,
  getByService,
  getByMskCategory,
} = require("../controllers/stats.controller");
const { protect, authorize } = require("../middlewares/auth.middleware");

router.get("/dashboard", protect, authorize("owner", "admin"), getDashboard);
router.get("/by-region", protect, authorize("owner", "admin"), getByRegion);
router.get("/trends", protect, authorize("owner", "admin"), getTrends);
router.get("/by-region/detailed", protect, authorize("owner", "admin"), getRegionDetailed);
router.get("/heatmap", protect, authorize("owner", "admin"), getHeatmap);
router.get("/by-category", protect, authorize("owner", "admin"), getByCategory);
router.get("/by-service", protect, authorize("owner", "admin"), getByService);
router.get("/by-msk-category", protect, authorize("owner", "admin"), getByMskCategory);

module.exports = router;
