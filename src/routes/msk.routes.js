const router = require("express").Router();
const {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  createOrder,
  updateOrder,
  getMyOrders,
  getAllOrders,
  updateOrderStatus,
  confirmOrder,
  cancelOrder,
} = require("../controllers/msk.controller");
const { protect, authorize } = require("../middlewares/auth.middleware");
const { checkPermission } = require("../middlewares/permission.middleware");

// Categories
router.get("/categories", getCategories);
router.post("/categories", protect, authorize("owner"), createCategory);
router.put("/categories/:id", protect, authorize("owner"), updateCategory);
router.delete("/categories/:id", protect, authorize("owner"), deleteCategory);

// Orders
router.post("/orders", protect, authorize("user"), createOrder);
router.get("/orders/my", protect, authorize("user"), getMyOrders);
router.put("/orders/:id", protect, authorize("user"), updateOrder);
router.get("/orders", protect, authorize("owner", "admin"), checkPermission("msk", "read"), getAllOrders);
router.put("/orders/:id/status", protect, authorize("owner", "admin"), checkPermission("msk", "manage"), updateOrderStatus);
router.put("/orders/:id/confirm", protect, authorize("user"), confirmOrder);
router.put("/orders/:id/cancel", protect, authorize("user"), cancelOrder);

module.exports = router;
