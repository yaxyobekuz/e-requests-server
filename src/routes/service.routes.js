const router = require("express").Router();
const {
  getAll,
  create,
  update,
  remove,
} = require("../controllers/service.controller");
const { protect, authorize } = require("../middlewares/auth.middleware");

router.get("/", getAll);
router.post("/", protect, authorize("owner"), create);
router.put("/:id", protect, authorize("owner"), update);
router.delete("/:id", protect, authorize("owner"), remove);

module.exports = router;
