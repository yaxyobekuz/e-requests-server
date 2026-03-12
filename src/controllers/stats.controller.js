const mongoose = require("mongoose");
const Request = require("../models/request.model");
const ServiceReport = require("../models/service-report.model");
const MskOrder = require("../models/msk-order.model");
const User = require("../models/user.model");
const Region = require("../models/region.model");

const { Types: { ObjectId } } = mongoose;

/**
 * Builds a MongoDB $match stage from query params and the requesting user.
 * Admin role: forces their assignedRegion scope.
 * Owner role: optionally filters by regionId or districtId.
 *
 * @param {object} query - req.query
 * @param {object} user  - req.user
 * @returns {object} match stage object
 */
function buildMatchStage(query, user) {
  const { period = "30", regionId, districtId } = query;
  const since = new Date(Date.now() - parseInt(period, 10) * 86_400_000);
  const match = { createdAt: { $gte: since } };

  if (user.role === "admin" && user.assignedRegion) {
    const rid = user.assignedRegion.region;
    match["$or"] = [
      { "address.region": rid },
      { "address.district": rid },
      { "address.neighborhood": rid },
      { "address.street": rid },
    ];
  }

  if (user.role === "owner") {
    if (districtId) {
      match["address.district"] = new ObjectId(districtId);
    } else if (regionId) {
      match["address.region"] = new ObjectId(regionId);
    }
  }

  return match;
}

/**
 * Shared trend aggregation pipeline.
 *
 * @param {object} Model - Mongoose model
 * @param {object} match - $match stage
 * @returns {Promise<Array>} array of { date, count }
 */
function getTrend(Model, match) {
  return Model.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
    { $project: { date: "$_id", count: 1, _id: 0 } },
  ]);
}

/**
 * Shared topRegions aggregation pipeline.
 *
 * @param {object} Model - Mongoose model
 * @param {object} match - $match stage
 * @returns {Promise<Array>} array of { regionId, regionName, count }
 */
function getTopRegions(Model, match) {
  return Model.aggregate([
    { $match: match },
    { $group: { _id: "$address.region", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
    {
      $lookup: {
        from: "regions",
        localField: "_id",
        foreignField: "_id",
        as: "region",
      },
    },
    { $unwind: { path: "$region", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        regionId: "$_id",
        regionName: "$region.name",
        count: 1,
        _id: 0,
      },
    },
  ]);
}

/**
 * GET /api/stats/overview
 * Global KPI counts: requests, service reports, MSK orders, active users.
 */
const getOverview = async (req, res) => {
  try {
    const match = buildMatchStage(req.query, req.user);

    const [requests, services, msk, users] = await Promise.all([
      Request.countDocuments(match),
      ServiceReport.countDocuments(match),
      MskOrder.countDocuments(match),
      User.countDocuments({ role: "user", isActive: true }),
    ]);

    res.json({ requests, services, msk, users });
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/**
 * GET /api/stats/requests
 * Request analytics: byStatus, byCategory, trend, topRegions.
 */
const getRequests = async (req, res) => {
  try {
    const match = buildMatchStage(req.query, req.user);

    const [byStatus, byCategory, trend, topRegions] = await Promise.all([
      Request.aggregate([
        { $match: match },
        { $group: { _id: "$status", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Request.aggregate([
        { $match: match },
        { $group: { _id: "$category", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      getTrend(Request, match),
      getTopRegions(Request, match),
    ]);

    res.json({ byStatus, byCategory, trend, topRegions });
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/**
 * GET /api/stats/services
 * Service report analytics: byStatus, byService (top 5), trend, topRegions.
 */
const getServices = async (req, res) => {
  try {
    const match = buildMatchStage(req.query, req.user);

    const [byStatus, byService, trend, topRegions] = await Promise.all([
      ServiceReport.aggregate([
        { $match: match },
        { $group: { _id: "$status", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      ServiceReport.aggregate([
        { $match: match },
        { $group: { _id: "$service", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: "services",
            localField: "_id",
            foreignField: "_id",
            as: "svc",
          },
        },
        { $unwind: { path: "$svc", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            serviceName: { $ifNull: ["$svc.name", "Noma'lum"] },
            count: 1,
            _id: 0,
          },
        },
      ]),
      getTrend(ServiceReport, match),
      getTopRegions(ServiceReport, match),
    ]);

    res.json({ byStatus, byService, trend, topRegions });
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/**
 * GET /api/stats/msk
 * MSK order analytics: byStatus, byCategory (top 5), trend, topRegions.
 */
const getMsk = async (req, res) => {
  try {
    const match = buildMatchStage(req.query, req.user);

    const [byStatus, byCategory, trend, topRegions] = await Promise.all([
      MskOrder.aggregate([
        { $match: match },
        { $group: { _id: "$status", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      MskOrder.aggregate([
        { $match: match },
        { $group: { _id: "$category", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: "mskcategories",
            localField: "_id",
            foreignField: "_id",
            as: "cat",
          },
        },
        { $unwind: { path: "$cat", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            categoryName: { $ifNull: ["$cat.name", "Noma'lum"] },
            count: 1,
            _id: 0,
          },
        },
      ]),
      getTrend(MskOrder, match),
      getTopRegions(MskOrder, match),
    ]);

    res.json({ byStatus, byCategory, trend, topRegions });
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/**
 * GET /api/stats/by-region
 * All top-level regions with aggregate counts across all 3 modules.
 * Used to color the map and render the region breakdown chart.
 */
const getByRegion = async (req, res) => {
  try {
    const match = buildMatchStage(req.query, req.user);

    const [allRegions, reqCounts, svcCounts, mskCounts] = await Promise.all([
      Region.find({ type: "region", isActive: true }).select("_id name").lean(),
      Request.aggregate([
        { $match: match },
        { $group: { _id: "$address.region", count: { $sum: 1 } } },
      ]),
      ServiceReport.aggregate([
        { $match: match },
        { $group: { _id: "$address.region", count: { $sum: 1 } } },
      ]),
      MskOrder.aggregate([
        { $match: match },
        { $group: { _id: "$address.region", count: { $sum: 1 } } },
      ]),
    ]);

    const toMap = (arr) =>
      Object.fromEntries(arr.map((r) => [String(r._id), r.count]));

    const reqMap = toMap(reqCounts);
    const svcMap = toMap(svcCounts);
    const mskMap = toMap(mskCounts);

    const result = allRegions.map((r) => {
      const id = String(r._id);
      const requests = reqMap[id] || 0;
      const services = svcMap[id] || 0;
      const msk = mskMap[id] || 0;
      return { _id: r._id, name: r.name, requests, services, msk, total: requests + services + msk };
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/**
 * GET /api/stats/by-district/:regionId
 * Districts within a region with counts across all 3 modules.
 */
const getByDistrict = async (req, res) => {
  try {
    const { regionId } = req.params;
    const match = buildMatchStage(req.query, req.user);

    // Override region filter to the specific parent region
    delete match["$or"];
    match["address.region"] = new ObjectId(regionId);

    const [districts, reqCounts, svcCounts, mskCounts] = await Promise.all([
      Region.find({ type: "district", parent: regionId, isActive: true })
        .select("_id name")
        .lean(),
      Request.aggregate([
        { $match: { ...match, "address.district": { $exists: true } } },
        { $group: { _id: "$address.district", count: { $sum: 1 } } },
      ]),
      ServiceReport.aggregate([
        { $match: { ...match, "address.district": { $exists: true } } },
        { $group: { _id: "$address.district", count: { $sum: 1 } } },
      ]),
      MskOrder.aggregate([
        { $match: { ...match, "address.district": { $exists: true } } },
        { $group: { _id: "$address.district", count: { $sum: 1 } } },
      ]),
    ]);

    const toMap = (arr) =>
      Object.fromEntries(arr.map((r) => [String(r._id), r.count]));

    const reqMap = toMap(reqCounts);
    const svcMap = toMap(svcCounts);
    const mskMap = toMap(mskCounts);

    const result = districts.map((d) => {
      const id = String(d._id);
      const requests = reqMap[id] || 0;
      const services = svcMap[id] || 0;
      const msk = mskMap[id] || 0;
      return { _id: d._id, name: d.name, requests, services, msk, total: requests + services + msk };
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

module.exports = {
  getOverview,
  getRequests,
  getServices,
  getMsk,
  getByRegion,
  getByDistrict,
};
