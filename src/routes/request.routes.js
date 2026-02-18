const router = require("express").Router();
const {
  create,
  getMyRequests,
  update,
  getAll,
  updateStatus,
  getStats,
  cancelRequest,
} = require("../controllers/request.controller");
const { protect, authorize } = require("../middlewares/auth.middleware");
const { checkPermission } = require("../middlewares/permission.middleware");

router.post("/", protect, authorize("user"), create);
router.get("/my", protect, authorize("user"), getMyRequests);
router.put("/:id", protect, authorize("user"), update);
router.put("/:id/cancel", protect, authorize("user"), cancelRequest);
router.get("/stats", protect, authorize("owner", "admin"), checkPermission("requests", "read"), getStats);
router.get("/", protect, authorize("owner", "admin"), checkPermission("requests", "read"), getAll);
router.put("/:id/status", protect, authorize("owner", "admin"), checkPermission("requests", "manage"), updateStatus);

module.exports = router;
