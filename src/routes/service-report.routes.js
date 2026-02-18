const router = require("express").Router();
const {
  createReport,
  getMyReports,
  getAllReports,
  updateReportStatus,
  confirmReport,
  cancelReport,
  getServiceStats,
} = require("../controllers/service.controller");
const { protect, authorize } = require("../middlewares/auth.middleware");
const { checkPermission } = require("../middlewares/permission.middleware");

router.post("/", protect, authorize("user"), createReport);
router.get("/my", protect, authorize("user"), getMyReports);
router.get("/stats", protect, authorize("owner", "admin"), checkPermission("services", "read"), getServiceStats);
router.get("/", protect, authorize("owner", "admin"), checkPermission("services", "read"), getAllReports);
router.put("/:id/status", protect, authorize("owner", "admin"), checkPermission("services", "manage"), updateReportStatus);
router.put("/:id/confirm", protect, authorize("user"), confirmReport);
router.put("/:id/cancel", protect, authorize("user"), cancelReport);

module.exports = router;
