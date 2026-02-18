/**
 * Modul bo'yicha ruxsatni tekshirish
 * @param {string} module - "requests" | "services" | "msk"
 * @param {string} requiredLevel - "read" | "manage"
 */
const checkPermission = (module, requiredLevel) => {
  return (req, res, next) => {
    // Owner har doim to'liq ruxsatga ega
    if (req.user.role === "owner") return next();

    // Faqat adminlar uchun tekshirish
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Ruxsat berilmagan" });
    }

    const permissions = req.user.permissions;
    if (!permissions) return next();

    const modulePerms = permissions[module];
    if (!modulePerms) return next();

    const access = modulePerms.access || "manage";

    if (access === "off") {
      return res
        .status(403)
        .json({ message: "Bu modul uchun ruxsat berilmagan" });
    }

    if (requiredLevel === "manage" && access === "read") {
      return res
        .status(403)
        .json({ message: "Faqat ko'rish ruxsati mavjud" });
    }

    // Ruxsat berilgan ID larni req ga biriktirish (controllerlar uchun)
    if (module === "requests") {
      req.allowedTypes = modulePerms.allowedTypes || [];
    } else if (module === "services") {
      req.allowedServiceTypes = modulePerms.allowedTypes || [];
    } else if (module === "msk") {
      req.allowedMskCategories = modulePerms.allowedCategories || [];
    }

    next();
  };
};

module.exports = { checkPermission };
