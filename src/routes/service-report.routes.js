const router = require("express").Router();
const {
  createReport,
  getMyReports,
  getAllReports,
  updateReportStatus,
  confirmReport,
  getServiceStats,
} = require("../controllers/service.controller");
const { protect, authorize } = require("../middlewares/auth.middleware");

router.post("/", protect, authorize("user"), createReport);
router.get("/my", protect, authorize("user"), getMyReports);
router.get("/stats", protect, authorize("owner", "admin"), getServiceStats);
router.get("/", protect, authorize("owner", "admin"), getAllReports);
router.put("/:id/status", protect, authorize("owner", "admin"), updateReportStatus);
router.put("/:id/confirm", protect, authorize("user"), confirmReport);

module.exports = router;
