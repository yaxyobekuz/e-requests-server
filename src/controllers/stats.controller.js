const mongoose = require("mongoose");
const Request = require("../models/request.model");
const ServiceReport = require("../models/service-report.model");
const MskOrder = require("../models/msk-order.model");
const User = require("../models/user.model");

// ─── Shared Helpers ────────────────────────────────────────────────────────────

function buildRegionMatch(user) {
  if (user.role === "admin" && user.assignedRegion) {
    const rid = new mongoose.Types.ObjectId(
      user.assignedRegion.region.toString()
    );
    return {
      $or: [
        { "address.region": rid },
        { "address.district": rid },
        { "address.neighborhood": rid },
        { "address.street": rid },
      ],
    };
  }
  return {};
}

function formatStatusCounts(stats) {
  const result = { total: 0 };
  stats.forEach((s) => {
    result[s._id] = s.count;
    result.total += s.count;
  });
  return result;
}

function calcResolutionRate(byStatus) {
  const resolved = (byStatus.resolved || 0) + (byStatus.confirmed || 0);
  return byStatus.total > 0
    ? Math.round((resolved / byStatus.total) * 100)
    : 0;
}

function fillDateGaps(rawData, fromDate) {
  const map = new Map(rawData.map((d) => [d.date, d.count]));
  const result = [];
  const cursor = new Date(fromDate);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  while (cursor <= today) {
    const key = cursor.toISOString().split("T")[0];
    result.push({ date: key, count: map.get(key) || 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

function buildTrendPipeline(regionMatch, fromDate) {
  const matchStage =
    Object.keys(regionMatch).length > 0
      ? { $match: { ...regionMatch, createdAt: { $gte: fromDate } } }
      : { $match: { createdAt: { $gte: fromDate } } };

  return [
    matchStage,
    {
      $group: {
        _id: {
          year: { $year: "$createdAt" },
          month: { $month: "$createdAt" },
          day: { $dayOfMonth: "$createdAt" },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
    {
      $project: {
        _id: 0,
        date: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: {
              $dateFromParts: {
                year: "$_id.year",
                month: "$_id.month",
                day: "$_id.day",
              },
            },
          },
        },
        count: 1,
      },
    },
  ];
}

// ─── Existing Controllers ──────────────────────────────────────────────────────

/** GET /api/stats/dashboard */
const getDashboard = async (req, res) => {
  try {
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

    const [requestStats, serviceStats, mskStats, userCount] = await Promise.all([
      Request.aggregate(pipeline),
      ServiceReport.aggregate(pipeline),
      MskOrder.aggregate(pipeline),
      User.countDocuments({ role: "user" }),
    ]);

    res.json({
      requests: formatStatusCounts(requestStats),
      serviceReports: formatStatusCounts(serviceStats),
      mskOrders: formatStatusCounts(mskStats),
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

    if (req.user.role === "admin") {
      const hasAccess =
        req.user.assignedRegion &&
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
      Request.aggregate([{ $match: matchStage }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
      ServiceReport.aggregate([{ $match: matchStage }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
      MskOrder.aggregate([{ $match: matchStage }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    ]);

    res.json({
      requests: formatStatusCounts(requestStats),
      serviceReports: formatStatusCounts(serviceStats),
      mskOrders: formatStatusCounts(mskStats),
    });
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

// ─── New Controllers ───────────────────────────────────────────────────────────

/** GET /api/stats/comprehensive */
const getComprehensive = async (req, res) => {
  try {
    const isOwner = req.user.role === "owner";
    const regionMatch = buildRegionMatch(req.user);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    const baseMatch = Object.keys(regionMatch).length > 0 ? [{ $match: regionMatch }] : [];

    // ── Requests aggregations ──
    const reqByStatusPipeline = [
      ...baseMatch,
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ];

    const reqByCategoryPipeline = [
      ...baseMatch,
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ];

    const reqByTypePipeline = [
      ...baseMatch,
      { $match: { type: { $ne: null } } },
      { $group: { _id: "$type", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "requesttypes",
          localField: "_id",
          foreignField: "_id",
          as: "typeInfo",
        },
      },
      { $unwind: { path: "$typeInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          name: { $ifNull: ["$typeInfo.name", "Belgilanmagan"] },
          count: 1,
        },
      },
    ];

    const reqTodayPipeline = [
      ...(Object.keys(regionMatch).length > 0
        ? [{ $match: { ...regionMatch, createdAt: { $gte: yesterdayStart } } }]
        : [{ $match: { createdAt: { $gte: yesterdayStart } } }]),
      {
        $group: {
          _id: {
            $cond: [{ $gte: ["$createdAt", todayStart] }, "today", "yesterday"],
          },
          count: { $sum: 1 },
        },
      },
    ];

    // ── Service report aggregations ──
    const svcByStatusPipeline = [
      ...baseMatch,
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ];

    const svcByServicePipeline = [
      ...baseMatch,
      {
        $group: {
          _id: "$service",
          total: { $sum: 1 },
          unavailable: {
            $sum: {
              $cond: [
                { $in: ["$status", ["unavailable", "in_progress", "pending_confirmation"]] },
                1,
                0,
              ],
            },
          },
          confirmed: {
            $sum: { $cond: [{ $eq: ["$status", "confirmed"] }, 1, 0] },
          },
        },
      },
      { $sort: { total: -1 } },
      { $limit: 15 },
      {
        $lookup: {
          from: "services",
          localField: "_id",
          foreignField: "_id",
          as: "serviceInfo",
        },
      },
      { $unwind: { path: "$serviceInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          name: { $ifNull: ["$serviceInfo.name", "Noma'lum"] },
          total: 1,
          problemPercent: {
            $round: [
              {
                $multiply: [
                  { $divide: ["$unavailable", { $max: ["$total", 1] }] },
                  100,
                ],
              },
              0,
            ],
          },
          confirmedPercent: {
            $round: [
              {
                $multiply: [
                  { $divide: ["$confirmed", { $max: ["$total", 1] }] },
                  100,
                ],
              },
              0,
            ],
          },
        },
      },
    ];

    // ── MSK aggregations ──
    const mskByStatusPipeline = [
      ...baseMatch,
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ];

    const mskByCategoryPipeline = [
      ...baseMatch,
      { $group: { _id: "$category", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      {
        $lookup: {
          from: "mskcategories",
          localField: "_id",
          foreignField: "_id",
          as: "categoryInfo",
        },
      },
      { $unwind: { path: "$categoryInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          name: { $ifNull: ["$categoryInfo.name", "Boshqa"] },
          count: 1,
        },
      },
    ];

    // Run all aggregations in parallel
    const [
      reqByStatus,
      reqByCategory,
      reqByType,
      reqToday,
      svcByStatus,
      svcByService,
      mskByStatus,
      mskByCategory,
    ] = await Promise.all([
      Request.aggregate(reqByStatusPipeline),
      Request.aggregate(reqByCategoryPipeline),
      Request.aggregate(reqByTypePipeline),
      Request.aggregate(reqTodayPipeline),
      ServiceReport.aggregate(svcByStatusPipeline),
      ServiceReport.aggregate(svcByServicePipeline),
      MskOrder.aggregate(mskByStatusPipeline),
      MskOrder.aggregate(mskByCategoryPipeline),
    ]);

    // Format request stats
    const reqStatus = formatStatusCounts(reqByStatus);
    const reqTodayMap = {};
    reqToday.forEach((r) => { reqTodayMap[r._id] = r.count; });

    // Format category
    const reqCategory = {};
    reqByCategory.forEach((c) => { reqCategory[c._id] = c.count; });

    // Format service report stats
    const svcStatus = formatStatusCounts(svcByStatus);

    // Format msk stats
    const mskStatus = formatStatusCounts(mskByStatus);
    const mskTodayPipeline = [
      ...(Object.keys(regionMatch).length > 0
        ? [{ $match: { ...regionMatch, createdAt: { $gte: yesterdayStart } } }]
        : [{ $match: { createdAt: { $gte: yesterdayStart } } }]),
      {
        $group: {
          _id: { $cond: [{ $gte: ["$createdAt", todayStart] }, "today", "yesterday"] },
          count: { $sum: 1 },
        },
      },
    ];
    const svcTodayPipeline = [
      ...(Object.keys(regionMatch).length > 0
        ? [{ $match: { ...regionMatch, createdAt: { $gte: yesterdayStart } } }]
        : [{ $match: { createdAt: { $gte: yesterdayStart } } }]),
      {
        $group: {
          _id: { $cond: [{ $gte: ["$createdAt", todayStart] }, "today", "yesterday"] },
          count: { $sum: 1 },
        },
      },
    ];

    const [mskToday, svcToday] = await Promise.all([
      MskOrder.aggregate(mskTodayPipeline),
      ServiceReport.aggregate(svcTodayPipeline),
    ]);

    const mskTodayMap = {};
    mskToday.forEach((r) => { mskTodayMap[r._id] = r.count; });
    const svcTodayMap = {};
    svcToday.forEach((r) => { svcTodayMap[r._id] = r.count; });

    // Users (owner only)
    let usersData = null;
    if (isOwner) {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);
      const [totalUsers, todayUsers, weekUsers] = await Promise.all([
        User.countDocuments({ role: "user" }),
        User.countDocuments({ role: "user", createdAt: { $gte: todayStart } }),
        User.countDocuments({ role: "user", createdAt: { $gte: weekStart } }),
      ]);
      usersData = { total: totalUsers, today: todayUsers, thisWeek: weekUsers };
    }

    const response = {
      requests: {
        ...reqStatus,
        today: reqTodayMap.today || 0,
        yesterday: reqTodayMap.yesterday || 0,
        resolutionRate: calcResolutionRate(reqStatus),
        byStatus: reqStatus,
        byCategory: reqCategory,
        byType: reqByType,
      },
      serviceReports: {
        ...svcStatus,
        today: svcTodayMap.today || 0,
        yesterday: svcTodayMap.yesterday || 0,
        resolutionRate: calcResolutionRate(svcStatus),
        byStatus: svcStatus,
        byService: svcByService,
      },
      mskOrders: {
        ...mskStatus,
        today: mskTodayMap.today || 0,
        yesterday: mskTodayMap.yesterday || 0,
        resolutionRate: calcResolutionRate(mskStatus),
        byStatus: mskStatus,
        byCategory: mskByCategory,
      },
    };

    if (usersData) response.users = usersData;

    res.json(response);
  } catch (error) {
    console.error("getComprehensive error:", error);
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** GET /api/stats/trends */
const getTrends = async (req, res) => {
  try {
    const { period = "30d" } = req.query;
    const regionMatch = buildRegionMatch(req.user);

    const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);
    fromDate.setHours(0, 0, 0, 0);

    const pipeline = buildTrendPipeline(regionMatch, fromDate);

    const [requestsTrend, serviceReportsTrend, mskOrdersTrend] = await Promise.all([
      Request.aggregate(pipeline),
      ServiceReport.aggregate(pipeline),
      MskOrder.aggregate(pipeline),
    ]);

    res.json({
      period,
      requests: fillDateGaps(requestsTrend, fromDate),
      serviceReports: fillDateGaps(serviceReportsTrend, fromDate),
      mskOrders: fillDateGaps(mskOrdersTrend, fromDate),
    });
  } catch (error) {
    console.error("getTrends error:", error);
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** GET /api/stats/by-region/detailed */
const getRegionalDetailed = async (req, res) => {
  try {
    const { regionId, regionType } = req.query;

    // Admin access check
    if (req.user.role === "admin" && regionId) {
      const hasAccess =
        req.user.assignedRegion &&
        req.user.assignedRegion.region.toString() === regionId;
      if (!hasAccess) {
        return res.status(403).json({ message: "Bu hudud uchun ruxsat berilmagan" });
      }
    }

    // Determine the grouping field based on current level
    let groupField;
    let filterField;
    let nextLevel;

    if (!regionId) {
      // Top level: group by region
      groupField = "$address.region";
      filterField = null;
      nextLevel = "region";
    } else if (regionType === "region") {
      groupField = "$address.district";
      filterField = "address.region";
      nextLevel = "district";
    } else if (regionType === "district") {
      groupField = "$address.neighborhood";
      filterField = "address.district";
      nextLevel = "neighborhood";
    } else if (regionType === "neighborhood") {
      groupField = "$address.street";
      filterField = "address.neighborhood";
      nextLevel = "street";
    } else {
      return res.status(400).json({ message: "Noto'g'ri regionType" });
    }

    const baseMatch =
      filterField && regionId
        ? { [filterField]: new mongoose.Types.ObjectId(regionId) }
        : {};

    // For admin without regionId, apply their assigned region filter
    const adminRegionMatch = buildRegionMatch(req.user);
    const matchCondition =
      filterField && regionId
        ? { $match: baseMatch }
        : Object.keys(adminRegionMatch).length > 0
          ? { $match: adminRegionMatch }
          : { $match: {} };

    const groupPipeline = [
      matchCondition,
      {
        $group: {
          _id: groupField,
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 50 },
      {
        $lookup: {
          from: "regions",
          localField: "_id",
          foreignField: "_id",
          as: "regionInfo",
        },
      },
      { $unwind: { path: "$regionInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          name: { $ifNull: ["$regionInfo.name", "Noma'lum"] },
          count: 1,
        },
      },
    ];

    const [requestsCounts, serviceCounts, mskCounts] = await Promise.all([
      Request.aggregate(groupPipeline),
      ServiceReport.aggregate(groupPipeline),
      MskOrder.aggregate(groupPipeline),
    ]);

    // Merge all counts by region _id
    const mergeMap = new Map();

    requestsCounts.forEach((r) => {
      const key = r._id ? r._id.toString() : "null";
      mergeMap.set(key, {
        _id: r._id,
        name: r.name,
        requests: r.count,
        serviceReports: 0,
        mskOrders: 0,
      });
    });

    serviceCounts.forEach((r) => {
      const key = r._id ? r._id.toString() : "null";
      if (mergeMap.has(key)) {
        mergeMap.get(key).serviceReports = r.count;
      } else {
        mergeMap.set(key, {
          _id: r._id,
          name: r.name,
          requests: 0,
          serviceReports: r.count,
          mskOrders: 0,
        });
      }
    });

    mskCounts.forEach((r) => {
      const key = r._id ? r._id.toString() : "null";
      if (mergeMap.has(key)) {
        mergeMap.get(key).mskOrders = r.count;
      } else {
        mergeMap.set(key, {
          _id: r._id,
          name: r.name,
          requests: 0,
          serviceReports: 0,
          mskOrders: r.count,
        });
      }
    });

    const items = Array.from(mergeMap.values())
      .map((item) => ({
        ...item,
        total: item.requests + item.serviceReports + item.mskOrders,
      }))
      .sort((a, b) => b.total - a.total);

    res.json({
      level: nextLevel,
      parentId: regionId || null,
      items,
    });
  } catch (error) {
    console.error("getRegionalDetailed error:", error);
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

module.exports = {
  getDashboard,
  getByRegion,
  getComprehensive,
  getTrends,
  getRegionalDetailed,
};
