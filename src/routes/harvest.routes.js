const { Router } = require("express");
const { protect, authorize } = require("../middlewares/auth.middleware");
const {
  createHarvest,
  getMyHarvest,
  deleteMyHarvest,
  getStatsOverview,
  getStatsByRegion,
  getStatsByDistrict,
} = require("../controllers/harvest.controller");

const router = Router();

// Fuqaro uchun
router.post("/", protect, authorize("user"), createHarvest);
router.get("/my", protect, authorize("user"), getMyHarvest);
router.delete("/:id", protect, authorize("user"), deleteMyHarvest);

// Admin / Owner uchun statistika
router.get("/stats/overview", protect, getStatsOverview);
router.get("/stats/by-region", protect, authorize("owner", "admin"), getStatsByRegion);
router.get("/stats/by-district/:regionId", protect, authorize("owner", "admin"), getStatsByDistrict);

module.exports = router;
