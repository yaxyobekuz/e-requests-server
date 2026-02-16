const router = require("express").Router();
const { getAll, getById, create, update, remove } = require("../controllers/region.controller");
const { protect, authorize } = require("../middlewares/auth.middleware");

router.get("/", getAll);
router.get("/:id", getById);
router.post("/", protect, authorize("owner", "admin"), create);
router.put("/:id", protect, authorize("owner", "admin"), update);
router.delete("/:id", protect, authorize("owner"), remove);

module.exports = router;
