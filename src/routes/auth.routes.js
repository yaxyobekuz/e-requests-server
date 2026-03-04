const router = require("express").Router();
const {
  register,
  login,
  adminLogin,
  getMe,
  checkPhone,
  loginWithOtp,
  adminLoginWithOtp,
  registerWithOtp,
} = require("../controllers/auth.controller");
const { protect } = require("../middlewares/auth.middleware");

router.post("/register", register);
router.post("/login", login);
router.post("/admin/login", adminLogin);
router.get("/me", protect, getMe);

router.post("/check-phone", checkPhone);
router.post("/login/otp", loginWithOtp);
router.post("/admin/login/otp", adminLoginWithOtp);
router.post("/register/otp", registerWithOtp);

module.exports = router;
