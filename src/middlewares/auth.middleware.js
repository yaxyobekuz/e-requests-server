const jwt = require("jsonwebtoken");
const User = require("../models/user.model");
const config = require("../config/env.config");

/**
 * JWT token tekshirish va foydalanuvchini req.user ga biriktirish
 */
const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Token topilmadi" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, config.JWT_SECRET);

    const user = await User.findById(decoded.id);
    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Foydalanuvchi topilmadi" });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Yaroqsiz token" });
  }
};

/**
 * Rollarni tekshirish
 * @param {...string} roles - Ruxsat berilgan rollar
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Ruxsat berilmagan" });
    }
    next();
  };
};

/**
 * Adminning hudud bo'yicha ruxsatini tekshirish.
 * req.params yoki req.body dan regionId olinadi.
 * @param {string} accessLevel - "read" yoki "manage"
 */
const checkRegionAccess = (accessLevel = "read") => {
  return (req, res, next) => {
    if (req.user.role === "owner") return next();
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Ruxsat berilmagan" });
    }

    const regionId =
      req.params.regionId || req.body.regionId || req.query.regionId;

    if (!regionId) return next();

    const ar = req.user.assignedRegion;
    const hasAccess = ar && ar.region.toString() === regionId.toString();

    if (!hasAccess) {
      return res
        .status(403)
        .json({ message: "Bu hudud uchun ruxsat berilmagan" });
    }

    next();
  };
};

module.exports = { protect, authorize, checkRegionAccess };
