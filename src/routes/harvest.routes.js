const { Router } = require("express");
const { protect, authorize } = require("../middlewares/auth.middleware");
const {
  createHarvest,
  getMyHarvest,
  deleteMyHarvest,
  getStatsOverview,
  getStatsByRegion,
} = require("../controllers/harvest.controller");

const router = Router();

// Fuqaro uchun
router.post("/", protect, authorize("user"), createHarvest);
router.get("/my", protect, authorize("user"), getMyHarvest);
router.delete("/:id", protect, authorize("user"), deleteMyHarvest);

// Admin / Owner uchun statistika
router.get("/stats/overview", protect, authorize("owner", "admin"), getStatsOverview);
router.get("/stats/by-region", protect, authorize("owner", "admin"), getStatsByRegion);

module.exports = router;
