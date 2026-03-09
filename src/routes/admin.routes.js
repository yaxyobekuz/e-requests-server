const router = require("express").Router();
const {
  getAll,
  getById,
  create,
  update,
  remove,
  setRegion,
  updatePermissions,
  updateDelegation,
} = require("../controllers/admin.controller");
const { protect, authorize, authorizeAdminManager } = require("../middlewares/auth.middleware");

router.get("/", protect, authorizeAdminManager, getAll);
router.post("/", protect, authorizeAdminManager, create);
router.get("/:id", protect, authorizeAdminManager, getById);
router.put("/:id", protect, authorizeAdminManager, update);
router.delete("/:id", protect, authorizeAdminManager, remove);
router.put("/:id/region", protect, authorizeAdminManager, setRegion);
router.put("/:id/permissions", protect, authorizeAdminManager, updatePermissions);
router.put("/:id/delegation", protect, authorize("owner"), updateDelegation);

module.exports = router;
