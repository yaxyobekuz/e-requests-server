const router = require("express").Router();
const { setRegion, getProfile, updateProfile } = require("../controllers/user.controller");
const { protect } = require("../middlewares/auth.middleware");

router.get("/me", protect, getProfile);
router.put("/me", protect, updateProfile);
router.put("/region", protect, setRegion);

module.exports = router;
