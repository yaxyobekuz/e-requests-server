const router = require("express").Router();
const {
  create,
  getMyRequests,
  update,
  getAll,
  updateStatus,
  getStats,
} = require("../controllers/request.controller");
const { protect, authorize } = require("../middlewares/auth.middleware");

router.post("/", protect, authorize("user"), create);
router.get("/my", protect, authorize("user"), getMyRequests);
router.put("/:id", protect, authorize("user"), update);
router.get("/stats", protect, authorize("owner", "admin"), getStats);
router.get("/", protect, authorize("owner", "admin"), getAll);
router.put("/:id/status", protect, authorize("owner", "admin"), updateStatus);

module.exports = router;
