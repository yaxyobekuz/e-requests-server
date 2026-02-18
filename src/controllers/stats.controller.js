const mongoose = require("mongoose");
const Request = require("../models/request.model");
const ServiceReport = require("../models/service-report.model");
const MskOrder = require("../models/msk-order.model");
const User = require("../models/user.model");

/** GET /api/stats/dashboard */
const getDashboard = async (req, res) => {
  try {
    // Admin uchun faqat tayinlangan hudud bo'yicha filtrlash
    const regionMatch = {};
    if (req.user.role === "admin" && req.user.assignedRegion) {
      const rid = new mongoose.Types.ObjectId(req.user.assignedRegion.region.toString());
      regionMatch["$or"] = [
        { "address.region": rid },
        { "address.district": rid },
        { "address.neighborhood": rid },
        { "address.street": rid },
      ];
    }

    const hasFilter = Object.keys(regionMatch).length > 0;
    const pipeline = hasFilter
      ? [{ $match: regionMatch }, { $group: { _id: "$status", count: { $sum: 1 } } }]
      : [{ $group: { _id: "$status", count: { $sum: 1 } } }];

    const [requestStats, serviceStats, mskStats, userCount] =
      await Promise.all([
        Request.aggregate(pipeline),
        ServiceReport.aggregate(pipeline),
        MskOrder.aggregate(pipeline),
        User.countDocuments({ role: "user" }),
      ]);

    const formatStats = (stats) => {
      const result = { total: 0 };
      stats.forEach((s) => {
        result[s._id] = s.count;
        result.total += s.count;
      });
      return result;
    };

    res.json({
      requests: formatStats(requestStats),
      serviceReports: formatStats(serviceStats),
      mskOrders: formatStats(mskStats),
      totalUsers: userCount,
    });
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** GET /api/stats/by-region */
const getByRegion = async (req, res) => {
  try {
    const { regionId, regionType } = req.query;

    if (!regionId) {
      return res.status(400).json({ message: "Hudud ID kiritilishi shart" });
    }

    // Admin faqat o'ziga tayinlangan hududlarni ko'ra oladi
    if (req.user.role === "admin") {
      const hasAccess = req.user.assignedRegion &&
        req.user.assignedRegion.region.toString() === regionId;
      if (!hasAccess) {
        return res.status(403).json({ message: "Bu hudud uchun ruxsat berilmagan" });
      }
    }

    const objectId = new mongoose.Types.ObjectId(regionId);

    const addressField =
      regionType === "district"
        ? "address.district"
        : regionType === "neighborhood"
          ? "address.neighborhood"
          : "address.region";

    const matchStage = { [addressField]: objectId };

    const [requestStats, serviceStats, mskStats] = await Promise.all([
      Request.aggregate([
        { $match: matchStage },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      ServiceReport.aggregate([
        { $match: matchStage },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      MskOrder.aggregate([
        { $match: matchStage },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);

    const formatStats = (stats) => {
      const result = { total: 0 };
      stats.forEach((s) => {
        result[s._id] = s.count;
        result.total += s.count;
      });
      return result;
    };

    res.json({
      requests: formatStats(requestStats),
      serviceReports: formatStats(serviceStats),
      mskOrders: formatStats(mskStats),
    });
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

module.exports = { getDashboard, getByRegion };
