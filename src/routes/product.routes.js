const { Router } = require("express");
const { protect, authorize } = require("../middlewares/auth.middleware");
const {
  getAll,
  create,
  update,
  remove,
  addVariety,
  updateVariety,
  removeVariety,
} = require("../controllers/product.controller");

const router = Router();

// Public — fuqarolar mahsulotlar ro'yxatini olishlari uchun
router.get("/", getAll);

// Owner only
router.post("/", protect, authorize("owner"), create);
router.put("/:id", protect, authorize("owner"), update);
router.delete("/:id", protect, authorize("owner"), remove);
router.post("/:id/varieties", protect, authorize("owner"), addVariety);
router.put("/:id/varieties/:varId", protect, authorize("owner"), updateVariety);
router.delete("/:id/varieties/:varId", protect, authorize("owner"), removeVariety);

module.exports = router;
