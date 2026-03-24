const { Router } = require("express");
const { protect, authorize } = require("../middlewares/auth.middleware");
const {
  getOverview,
  getRequests,
  getServices,
  getMsk,
  getByRegion,
  getByDistrict,
  getUserStats,
  getUsersByRegion,
  getUsersByDistrict,
} = require("../controllers/stats.controller");

const router = Router();
const guard = [protect, authorize("owner", "admin")];

router.get("/overview", ...guard, getOverview);
router.get("/requests", ...guard, getRequests);
router.get("/services", ...guard, getServices);
router.get("/msk", ...guard, getMsk);
router.get("/users", ...guard, getUserStats);
router.get("/users/by-region", ...guard, getUsersByRegion);
router.get("/users/by-district/:regionId", ...guard, getUsersByDistrict);
router.get("/by-region", ...guard, getByRegion);
router.get("/by-district/:regionId", ...guard, getByDistrict);

module.exports = router;
