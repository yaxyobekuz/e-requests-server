const router = require("express").Router();
const { getAll, create, update, remove, setRegion } = require("../controllers/admin.controller");
const { protect, authorize } = require("../middlewares/auth.middleware");

router.get("/", protect, authorize("owner"), getAll);
router.post("/", protect, authorize("owner"), create);
router.put("/:id", protect, authorize("owner"), update);
router.delete("/:id", protect, authorize("owner"), remove);
router.put("/:id/region", protect, authorize("owner"), setRegion);

module.exports = router;
