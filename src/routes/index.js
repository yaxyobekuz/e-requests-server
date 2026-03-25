const { Router } = require("express");

const router = Router();

router.get("/", (req, res) => {
  res.status(200).json({ message: "API is running" });
});

router.use("/auth", require("./auth.routes"));
router.use("/users", require("./user.routes"));
router.use("/regions", require("./region.routes"));
router.use("/requests", require("./request.routes"));
router.use("/request-types", require("./request-type.routes"));
router.use("/services", require("./service.routes"));
router.use("/service-reports", require("./service-report.routes"));
router.use("/msk", require("./msk.routes"));
router.use("/admins", require("./admin.routes"));
router.use("/admin-roles", require("./admin-role.routes"));
router.use("/settings", require("./settings.routes"));
router.use("/stats", require("./stats.routes"));
router.use("/products", require("./product.routes"));
router.use("/harvest", require("./harvest.routes"));
router.use("/admin/users", require("./users-admin.routes"));

module.exports = router;
