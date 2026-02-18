const router = require("express").Router();
const { getAll, getById, create, update, remove, setRegion, updatePermissions } = require("../controllers/admin.controller");
const { protect, authorize } = require("../middlewares/auth.middleware");

router.get("/", protect, authorize("owner"), getAll);
router.post("/", protect, authorize("owner"), create);
router.get("/:id", protect, authorize("owner"), getById);
router.put("/:id", protect, authorize("owner"), update);
router.delete("/:id", protect, authorize("owner"), remove);
router.put("/:id/region", protect, authorize("owner"), setRegion);
router.put("/:id/permissions", protect, authorize("owner"), updatePermissions);

module.exports = router;
