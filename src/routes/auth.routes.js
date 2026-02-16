const router = require("express").Router();
const { register, login, adminLogin, getMe } = require("../controllers/auth.controller");
const { protect } = require("../middlewares/auth.middleware");

router.post("/register", register);
router.post("/login", login);
router.post("/admin/login", adminLogin);
router.get("/me", protect, getMe);

module.exports = router;
