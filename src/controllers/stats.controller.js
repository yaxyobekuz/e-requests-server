const mongoose = require("mongoose");
const Request = require("../models/request.model");
const ServiceReport = require("../models/service-report.model");
const MskOrder = require("../models/msk-order.model");
const User = require("../models/user.model");
const Region = require("../models/region.model");
const RequestType = require("../models/request-type.model");
const Service = require("../models/service.model");
const MskCategory = require("../models/msk-category.model");

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

/**
 * Builds admin region match filter for aggregation pipelines.
 * @param {object} user - req.user
 * @returns {object} MongoDB match stage object
 */
const buildAdminRegionMatch = (user) => {
  if (user.role === "admin" && user.assignedRegion) {
    const rid = new mongoose.Types.ObjectId(user.assignedRegion.region.toString());
    return {
      $or: [
        { "address.region": rid },
        { "address.district": rid },
        { "address.neighborhood": rid },
        { "address.street": rid },
      ],
    };
  }
  return null;
};

/**
 * GET /api/stats/trends
 * Returns time-series trend data for charts.
 * @query {string} period - "7d" | "30d" | "90d" | "1y"
 * @query {string} module - "requests" | "serviceReports" | "msk" | "all"
 */
const getTrends = async (req, res) => {
  try {
    const { period = "30d", module: mod = "all" } = req.query;

    const now = new Date();
    let startDate;
    let dateFormat;
    let groupByExpr;

    if (period === "7d") {
      startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
      dateFormat = "%Y-%m-%d";
      groupByExpr = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } };
    } else if (period === "90d") {
      startDate = new Date(now - 90 * 24 * 60 * 60 * 1000);
      dateFormat = "%Y-%m-%d";
      groupByExpr = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "+05:00" } };
    } else if (period === "1y") {
      startDate = new Date(now);
      startDate.setFullYear(startDate.getFullYear() - 1);
      dateFormat = "%Y-%m";
      groupByExpr = { $dateToString: { format: "%Y-%m", date: "$createdAt" } };
    } else {
      // default 30d
      startDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
      dateFormat = "%Y-%m-%d";
      groupByExpr = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } };
    }

    const adminMatch = buildAdminRegionMatch(req.user);
    const dateMatch = { createdAt: { $gte: startDate } };
    const baseMatch = adminMatch ? { $and: [adminMatch, dateMatch] } : dateMatch;

    const trendPipeline = [
      { $match: baseMatch },
      { $group: { _id: groupByExpr, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ];

    const promises = [];
    const keys = [];

    if (mod === "requests" || mod === "all") {
      promises.push(Request.aggregate(trendPipeline));
      keys.push("requests");
    }
    if (mod === "serviceReports" || mod === "all") {
      promises.push(ServiceReport.aggregate(trendPipeline));
      keys.push("serviceReports");
    }
    if (mod === "msk" || mod === "all") {
      promises.push(MskOrder.aggregate(trendPipeline));
      keys.push("mskOrders");
    }

    const results = await Promise.all(promises);

    // Collect all unique date labels
    const labelSet = new Set();
    results.forEach((r) => r.forEach((item) => labelSet.add(item._id)));
    const labels = Array.from(labelSet).sort();

    const response = { labels };
    keys.forEach((key, i) => {
      const map = {};
      results[i].forEach((item) => { map[item._id] = item.count; });
      response[key] = labels.map((l) => map[l] || 0);
    });

    res.json(response);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/**
 * GET /api/stats/by-region/detailed
 * Returns per-region counts for bar chart + table drill-down.
 * @query {string} [parentId] - parent region ID (omit for top-level)
 * @query {string} [level] - "region" | "district" | "neighborhood"
 */
const getRegionDetailed = async (req, res) => {
  try {
    const { parentId, level = "region", days } = req.query;

    // Admin can only see their assigned region
    if (req.user.role === "admin") {
      const assignedId = req.user.assignedRegion?.region?.toString();
      if (parentId && parentId !== assignedId) {
        return res.status(403).json({ message: "Bu hudud uchun ruxsat berilmagan" });
      }
    }

    const regionFilter = { type: level, isActive: true };
    if (parentId) {
      regionFilter.parent = new mongoose.Types.ObjectId(parentId);
    } else {
      regionFilter.parent = null;
    }

    const regions = await Region.find(regionFilter).select("_id name").lean();
    if (!regions.length) return res.json({ regions: [] });

    const regionIds = regions.map((r) => r._id);
    const addressField = level === "district"
      ? "address.district"
      : level === "neighborhood"
        ? "address.neighborhood"
        : "address.region";

    const dateFilter = days
      ? { createdAt: { $gte: new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000) } }
      : {};

    const matchStage = { [addressField]: { $in: regionIds }, ...dateFilter };

    const groupPipeline = [
      { $match: matchStage },
      { $group: { _id: `$${addressField}`, count: { $sum: 1 } } },
    ];

    const [reqCounts, svcCounts, mskCounts] = await Promise.all([
      Request.aggregate(groupPipeline),
      ServiceReport.aggregate(groupPipeline),
      MskOrder.aggregate(groupPipeline),
    ]);

    const toMap = (arr) => {
      const m = {};
      arr.forEach((x) => { m[x._id.toString()] = x.count; });
      return m;
    };

    const reqMap = toMap(reqCounts);
    const svcMap = toMap(svcCounts);
    const mskMap = toMap(mskCounts);

    const result = regions.map((r) => {
      const id = r._id.toString();
      const requests = reqMap[id] || 0;
      const serviceReports = svcMap[id] || 0;
      const mskOrders = mskMap[id] || 0;
      return {
        _id: r._id,
        name: r.name,
        requests,
        serviceReports,
        mskOrders,
        total: requests + serviceReports + mskOrders,
      };
    });

    result.sort((a, b) => b.total - a.total);

    res.json({ regions: result });
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/**
 * GET /api/stats/heatmap
 * Returns day-of-week × hour activity counts for heatmap chart.
 * @query {string} module - "requests" | "serviceReports" | "msk"
 * @query {number} [days] - lookback window in days (default: 30)
 */
const getHeatmap = async (req, res) => {
  try {
    const { module: mod = "requests", days = 30 } = req.query;

    const startDate = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);
    const adminMatch = buildAdminRegionMatch(req.user);
    const dateMatch = { createdAt: { $gte: startDate } };
    const baseMatch = adminMatch ? { $and: [adminMatch, dateMatch] } : dateMatch;

    const Model = mod === "serviceReports"
      ? ServiceReport
      : mod === "msk"
        ? MskOrder
        : Request;

    const raw = await Model.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: {
            day: { $dayOfWeek: "$createdAt" },   // 1=Sun ... 7=Sat
            hour: { $hour: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
    ]);

    // day: 1(Sun)→0-index: rearrange to Mon-first (0=Mon ... 6=Sun)
    const data = raw.map((item) => ({
      day: (item._id.day + 5) % 7,   // convert Sun=1 → Mon=0 ... Sun=6
      hour: item._id.hour,
      count: item.count,
    }));

    res.json({ data });
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/**
 * GET /api/stats/by-category
 * Returns request counts grouped by category (infrastructure/social/finance)
 * and by request type within each category.
 * @query {string} [regionId] - optional region filter
 */
const getByCategory = async (req, res) => {
  try {
    const { regionId } = req.query;

    const adminMatch = buildAdminRegionMatch(req.user);

    let regionMatch = null;
    if (regionId) {
      const rid = new mongoose.Types.ObjectId(regionId);
      regionMatch = {
        $or: [
          { "address.region": rid },
          { "address.district": rid },
          { "address.neighborhood": rid },
          { "address.street": rid },
        ],
      };
    }

    const baseMatch = adminMatch && regionMatch
      ? { $and: [adminMatch, regionMatch] }
      : adminMatch || regionMatch || {};

    // 1. Group by category
    const byCategory = await Request.aggregate([
      { $match: baseMatch },
      { $group: { _id: "$category", total: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]);

    // 2. Group by type (populate type name via $lookup)
    const typeMatch = Object.keys(baseMatch).length
      ? { $and: [baseMatch, { type: { $ne: null } }] }
      : { type: { $ne: null } };

    const byType = await Request.aggregate([
      { $match: typeMatch },
      { $group: { _id: "$type", total: { $sum: 1 } } },
      {
        $lookup: {
          from: "requesttypes",
          localField: "_id",
          foreignField: "_id",
          as: "typeDoc",
        },
      },
      { $unwind: { path: "$typeDoc", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          name: { $ifNull: ["$typeDoc.name", "Noma'lum"] },
          total: 1,
        },
      },
      { $sort: { total: -1 } },
    ]);

    // 3. Group by category + status
    const byCategoryStatus = await Request.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: { category: "$category", status: "$status" },
          count: { $sum: 1 },
        },
      },
    ]);

    // Format byCategoryStatus into nested map: { category: { status: count } }
    const categoryStatusMap = {};
    byCategoryStatus.forEach(({ _id, count }) => {
      if (!categoryStatusMap[_id.category]) categoryStatusMap[_id.category] = { total: 0 };
      categoryStatusMap[_id.category][_id.status] = count;
      categoryStatusMap[_id.category].total += count;
    });

    res.json({
      byCategory: byCategory.map((c) => ({
        category: c._id,
        total: c.total,
        statuses: categoryStatusMap[c._id] || { total: 0 },
      })),
      byType,
    });
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/**
 * GET /api/stats/by-service
 * Returns service report counts grouped by service.
 * @query {string} [regionId] - optional region filter
 */
const getByService = async (req, res) => {
  try {
    const { regionId } = req.query;

    const adminMatch = buildAdminRegionMatch(req.user);

    let regionMatch = null;
    if (regionId) {
      const rid = new mongoose.Types.ObjectId(regionId);
      regionMatch = {
        $or: [
          { "address.region": rid },
          { "address.district": rid },
          { "address.neighborhood": rid },
          { "address.street": rid },
        ],
      };
    }

    const baseMatch = adminMatch && regionMatch
      ? { $and: [adminMatch, regionMatch] }
      : adminMatch || regionMatch || {};

    // Group by service + status, then pivot
    const raw = await ServiceReport.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: { service: "$service", status: "$status" },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: "$_id.service",
          statuses: { $push: { status: "$_id.status", count: "$count" } },
          total: { $sum: "$count" },
        },
      },
      {
        $lookup: {
          from: "services",
          localField: "_id",
          foreignField: "_id",
          as: "serviceDoc",
        },
      },
      { $unwind: { path: "$serviceDoc", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          name: { $ifNull: ["$serviceDoc.name", "Noma'lum"] },
          icon: { $ifNull: ["$serviceDoc.icon", ""] },
          total: 1,
          statuses: 1,
        },
      },
      { $sort: { total: -1 } },
    ]);

    const services = raw.map((s) => {
      const statusMap = {};
      s.statuses.forEach(({ status, count }) => { statusMap[status] = count; });
      return {
        _id: s._id,
        name: s.name,
        icon: s.icon,
        total: s.total,
        statuses: statusMap,
      };
    });

    res.json({ services });
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/**
 * GET /api/stats/by-msk-category
 * Returns MSK order counts grouped by category.
 * @query {string} [regionId] - optional region filter
 */
const getByMskCategory = async (req, res) => {
  try {
    const { regionId } = req.query;

    const adminMatch = buildAdminRegionMatch(req.user);

    let regionMatch = null;
    if (regionId) {
      const rid = new mongoose.Types.ObjectId(regionId);
      regionMatch = {
        $or: [
          { "address.region": rid },
          { "address.district": rid },
          { "address.neighborhood": rid },
          { "address.street": rid },
        ],
      };
    }

    const baseMatch = adminMatch && regionMatch
      ? { $and: [adminMatch, regionMatch] }
      : adminMatch || regionMatch || {};

    // Group by category + status, then pivot
    const raw = await MskOrder.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: { category: "$category", status: "$status" },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: "$_id.category",
          statuses: { $push: { status: "$_id.status", count: "$count" } },
          total: { $sum: "$count" },
        },
      },
      {
        $lookup: {
          from: "mskcategories",
          localField: "_id",
          foreignField: "_id",
          as: "categoryDoc",
        },
      },
      { $unwind: { path: "$categoryDoc", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          name: { $ifNull: ["$categoryDoc.name", "Noma'lum"] },
          icon: { $ifNull: ["$categoryDoc.icon", ""] },
          total: 1,
          statuses: 1,
        },
      },
      { $sort: { total: -1 } },
    ]);

    const categories = raw.map((c) => {
      const statusMap = {};
      c.statuses.forEach(({ status, count }) => { statusMap[status] = count; });
      return {
        _id: c._id,
        name: c.name,
        icon: c.icon,
        total: c.total,
        statuses: statusMap,
      };
    });

    res.json({ categories });
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

module.exports = {
  getDashboard,
  getByRegion,
  getTrends,
  getRegionDetailed,
  getHeatmap,
  getByCategory,
  getByService,
  getByMskCategory,
};
