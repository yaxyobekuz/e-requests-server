const mongoose = require("mongoose");
const Request = require("../models/request.model");
const ServiceReport = require("../models/service-report.model");
const MskOrder = require("../models/msk-order.model");
const User = require("../models/user.model");
const Region = require("../models/region.model");

const {
  Types: { ObjectId },
} = mongoose;

/** Converts a query-string value to a usable ID or null (guards against string "null"). */
const cleanId = (v) => (v && v !== "null" && v !== "undefined" ? v : null);

function buildMatchStage(query, user) {
  const period = query.period || "30";
  const regionId = cleanId(query.regionId);
  const districtId = cleanId(query.districtId);
  const neighborhoodId = cleanId(query.neighborhoodId);
  const since = new Date(Date.now() - parseInt(period, 10) * 86_400_000);
  const match = { createdAt: { $gte: since } };

  if (user.role === "admin" && user.assignedRegion) {
    const rid = user.assignedRegion.region;
    // Allow sub-filtering within the assigned region scope
    if (neighborhoodId) {
      match["address.neighborhood"] = new ObjectId(neighborhoodId);
    } else if (districtId) {
      match["address.district"] = new ObjectId(districtId);
    } else {
      match["$or"] = [
        { "address.region": rid },
        { "address.district": rid },
        { "address.neighborhood": rid },
        { "address.street": rid },
      ];
    }
  }

  if (user.role === "owner") {
    if (neighborhoodId) {
      match["address.neighborhood"] = new ObjectId(neighborhoodId);
    } else if (districtId) {
      match["address.district"] = new ObjectId(districtId);
    } else if (regionId) {
      match["address.region"] = new ObjectId(regionId);
    }
  }

  return match;
}

/**
 * Admin scope filtrini saqlagan holda drill-down filtr qo'shadi.
 * Agar $or mavjud bo'lsa, uni $and ichiga o'rab, qo'shimcha filtr bilan birlashtiradi.
 *
 * @param {object} match - buildMatchStage() yoki buildUserMatchStage() natijasi
 * @param {object} extra - qo'shimcha filtr (masalan, { "address.region": id })
 * @returns {object} yangilangan match
 */
function applyDrillDown(match, extra) {
  if (match["$or"]) {
    const orClause = match["$or"];
    delete match["$or"];
    match["$and"] = [{ $or: orClause }, extra];
  } else {
    Object.assign(match, extra);
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
      User.countDocuments({ ...buildUserMatchStage(req.query, req.user, false), isActive: true }),
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
    const isAdmin = req.user.role === "admin" && req.user.assignedRegion;

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

    // Admin uchun faqat aggregation natijasida mavjud regionlarni ko'rsatish
    const relevantIds = isAdmin
      ? new Set([
          ...reqCounts.map((r) => String(r._id)),
          ...svcCounts.map((r) => String(r._id)),
          ...mskCounts.map((r) => String(r._id)),
        ])
      : null;

    const regions = isAdmin
      ? allRegions.filter((r) => relevantIds.has(String(r._id)))
      : allRegions;

    const result = regions.map((r) => {
      const id = String(r._id);
      const requests = reqMap[id] || 0;
      const services = svcMap[id] || 0;
      const msk = mskMap[id] || 0;
      return {
        _id: r._id,
        name: r.name,
        requests,
        services,
        msk,
        total: requests + services + msk,
      };
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

    applyDrillDown(match, { "address.region": new ObjectId(regionId) });

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
      return {
        _id: d._id,
        name: d.name,
        requests,
        services,
        msk,
        total: requests + services + msk,
      };
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/**
 * Builds a $match stage tailored for the User model.
 * Unlike buildMatchStage (which filters by address on request-like docs),
 * this filters User docs by their own address and createdAt.
 *
 * @param {object} query - req.query (period, regionId, districtId)
 * @param {object} user  - req.user
 * @param {boolean} [applyPeriod=true] - whether to scope by createdAt
 * @returns {object} match stage
 */
function buildUserMatchStage(query, user, applyPeriod = true) {
  const period = query.period || "30";
  const regionId = cleanId(query.regionId);
  const districtId = cleanId(query.districtId);
  const neighborhoodId = cleanId(query.neighborhoodId);
  const match = { role: "user" };

  if (applyPeriod) {
    const since = new Date(Date.now() - parseInt(period, 10) * 86_400_000);
    match.createdAt = { $gte: since };
  }

  if (user.role === "admin" && user.assignedRegion) {
    const rid = user.assignedRegion.region;
    if (neighborhoodId) {
      match["address.neighborhood"] = new ObjectId(neighborhoodId);
    } else if (districtId) {
      match["address.district"] = new ObjectId(districtId);
    } else {
      match["$or"] = [
        { "address.region": rid },
        { "address.district": rid },
        { "address.neighborhood": rid },
        { "address.street": rid },
      ];
    }
  }

  if (user.role === "owner") {
    if (neighborhoodId) {
      match["address.neighborhood"] = new ObjectId(neighborhoodId);
    } else if (districtId) {
      match["address.district"] = new ObjectId(districtId);
    } else if (regionId) {
      match["address.region"] = new ObjectId(regionId);
    }
  }

  return match;
}

/**
 * GET /api/stats/users
 * User analytics: trend (registrations), byStatus (active/inactive),
 * byRegion (per-region totals), topActive (most active users across all modules).
 */
const getUserStats = async (req, res) => {
  try {
    const trendMatch = buildUserMatchStage(req.query, req.user, true);
    const totalMatch = buildUserMatchStage(req.query, req.user, false);
    const activityMatch = buildMatchStage(req.query, req.user);

    const [trend, active, inactive, byRegion, topActive] = await Promise.all([
      // Registration trend (daily)
      User.aggregate([
        { $match: trendMatch },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $project: { date: "$_id", count: 1, _id: 0 } },
      ]),

      // Active users count
      User.countDocuments({ ...totalMatch, isActive: true }),

      // Inactive users count
      User.countDocuments({ ...totalMatch, isActive: false }),

      // By region with active/inactive breakdown
      User.aggregate([
        { $match: totalMatch },
        {
          $group: {
            _id: "$address.region",
            total: { $sum: 1 },
            active: { $sum: { $cond: ["$isActive", 1, 0] } },
            inactive: { $sum: { $cond: ["$isActive", 0, 1] } },
          },
        },
        { $sort: { total: -1 } },
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
            regionName: { $ifNull: ["$region.name", "Noma'lum"] },
            total: 1,
            active: 1,
            inactive: 1,
            _id: 0,
          },
        },
      ]),

      // Top active users (most requests + services + msk)
      (async () => {
        const [reqCounts, svcCounts, mskCounts] = await Promise.all([
          Request.aggregate([
            { $match: activityMatch },
            { $group: { _id: "$user", requests: { $sum: 1 } } },
          ]),
          ServiceReport.aggregate([
            { $match: activityMatch },
            { $group: { _id: "$user", services: { $sum: 1 } } },
          ]),
          MskOrder.aggregate([
            { $match: activityMatch },
            { $group: { _id: "$user", msk: { $sum: 1 } } },
          ]),
        ]);

        // Merge counts by user
        const userMap = new Map();
        for (const r of reqCounts) {
          const id = String(r._id);
          if (!userMap.has(id))
            userMap.set(id, { _id: r._id, requests: 0, services: 0, msk: 0 });
          userMap.get(id).requests = r.requests;
        }
        for (const s of svcCounts) {
          const id = String(s._id);
          if (!userMap.has(id))
            userMap.set(id, { _id: s._id, requests: 0, services: 0, msk: 0 });
          userMap.get(id).services = s.services;
        }
        for (const m of mskCounts) {
          const id = String(m._id);
          if (!userMap.has(id))
            userMap.set(id, { _id: m._id, requests: 0, services: 0, msk: 0 });
          userMap.get(id).msk = m.msk;
        }

        const sorted = [...userMap.values()]
          .map((u) => ({ ...u, total: u.requests + u.services + u.msk }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 10);

        // Populate user names + region
        const userIds = sorted.map((u) => u._id);
        const users = await User.find({ _id: { $in: userIds } })
          .select("firstName lastName address.region")
          .populate("address.region", "name")
          .lean();

        const usersById = Object.fromEntries(
          users.map((u) => [String(u._id), u]),
        );

        return sorted.map((u) => {
          const info = usersById[String(u._id)] || {};
          return {
            userId: u._id,
            firstName: info.firstName || "",
            lastName: info.lastName || "",
            regionName: info.address?.region?.name || "Noma'lum",
            requests: u.requests,
            services: u.services,
            msk: u.msk,
            total: u.total,
          };
        });
      })(),
    ]);

    res.json({
      trend,
      byStatus: { active, inactive, total: active + inactive },
      byRegion,
      topActive,
    });
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/**
 * GET /api/stats/users/by-region
 * All top-level regions with user counts (total, active, inactive).
 */
const getUsersByRegion = async (req, res) => {
  try {
    const match = buildUserMatchStage(req.query, req.user, false);
    const isAdmin = req.user.role === "admin" && req.user.assignedRegion;

    const [allRegions, userCounts] = await Promise.all([
      Region.find({ type: "region", isActive: true }).select("_id name").lean(),
      User.aggregate([
        { $match: match },
        {
          $group: {
            _id: "$address.region",
            total: { $sum: 1 },
            active: { $sum: { $cond: ["$isActive", 1, 0] } },
            inactive: { $sum: { $cond: ["$isActive", 0, 1] } },
          },
        },
      ]),
    ]);

    const countMap = Object.fromEntries(
      userCounts.map((r) => [String(r._id), r]),
    );

    // Admin uchun faqat aggregation natijasida mavjud regionlarni ko'rsatish
    const relevantIds = isAdmin
      ? new Set(userCounts.map((r) => String(r._id)))
      : null;

    const regions = isAdmin
      ? allRegions.filter((r) => relevantIds.has(String(r._id)))
      : allRegions;

    const result = regions.map((r) => {
      const id = String(r._id);
      const c = countMap[id] || { total: 0, active: 0, inactive: 0 };
      return {
        _id: r._id,
        name: r.name,
        total: c.total,
        active: c.active,
        inactive: c.inactive,
      };
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/**
 * GET /api/stats/users/by-district/:regionId
 * Districts (or neighborhoods if districtId query param is set) within
 * a region with user counts.
 */
const getUsersByDistrict = async (req, res) => {
  try {
    const { regionId } = req.params;
    const { districtId } = req.query;
    const match = buildUserMatchStage(req.query, req.user, false);

    if (districtId) {
      // Drill down to neighborhoods within a district
      applyDrillDown(match, { "address.district": new ObjectId(districtId) });

      const [neighborhoods, userCounts] = await Promise.all([
        Region.find({
          type: "neighborhood",
          parent: districtId,
          isActive: true,
        })
          .select("_id name")
          .lean(),
        User.aggregate([
          { $match: { ...match, "address.neighborhood": { $exists: true } } },
          {
            $group: {
              _id: "$address.neighborhood",
              total: { $sum: 1 },
              active: { $sum: { $cond: ["$isActive", 1, 0] } },
              inactive: { $sum: { $cond: ["$isActive", 0, 1] } },
            },
          },
        ]),
      ]);

      const countMap = Object.fromEntries(
        userCounts.map((r) => [String(r._id), r]),
      );

      const result = neighborhoods.map((n) => {
        const id = String(n._id);
        const c = countMap[id] || { total: 0, active: 0, inactive: 0 };
        return {
          _id: n._id,
          name: n.name,
          total: c.total,
          active: c.active,
          inactive: c.inactive,
        };
      });

      return res.json(result);
    }

    // Districts within a region
    applyDrillDown(match, { "address.region": new ObjectId(regionId) });

    const [districts, userCounts] = await Promise.all([
      Region.find({ type: "district", parent: regionId, isActive: true })
        .select("_id name")
        .lean(),
      User.aggregate([
        { $match: { ...match, "address.district": { $exists: true } } },
        {
          $group: {
            _id: "$address.district",
            total: { $sum: 1 },
            active: { $sum: { $cond: ["$isActive", 1, 0] } },
            inactive: { $sum: { $cond: ["$isActive", 0, 1] } },
          },
        },
      ]),
    ]);

    const countMap = Object.fromEntries(
      userCounts.map((r) => [String(r._id), r]),
    );

    const result = districts.map((d) => {
      const id = String(d._id);
      const c = countMap[id] || { total: 0, active: 0, inactive: 0 };
      return {
        _id: d._id,
        name: d.name,
        total: c.total,
        active: c.active,
        inactive: c.inactive,
      };
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/**
 * GET /api/stats/by-neighborhood/:districtId
 * Neighborhoods within a district with counts across all 3 modules.
 */
const getByNeighborhood = async (req, res) => {
  try {
    const { districtId } = req.params;
    const match = buildMatchStage(req.query, req.user);

    applyDrillDown(match, { "address.district": new ObjectId(districtId) });

    const [neighborhoods, reqCounts, svcCounts, mskCounts] = await Promise.all([
      Region.find({ type: "neighborhood", parent: districtId, isActive: true })
        .select("_id name")
        .lean(),
      Request.aggregate([
        { $match: { ...match, "address.neighborhood": { $exists: true } } },
        { $group: { _id: "$address.neighborhood", count: { $sum: 1 } } },
      ]),
      ServiceReport.aggregate([
        { $match: { ...match, "address.neighborhood": { $exists: true } } },
        { $group: { _id: "$address.neighborhood", count: { $sum: 1 } } },
      ]),
      MskOrder.aggregate([
        { $match: { ...match, "address.neighborhood": { $exists: true } } },
        { $group: { _id: "$address.neighborhood", count: { $sum: 1 } } },
      ]),
    ]);

    const toMap = (arr) =>
      Object.fromEntries(arr.map((r) => [String(r._id), r.count]));

    const reqMap = toMap(reqCounts);
    const svcMap = toMap(svcCounts);
    const mskMap = toMap(mskCounts);

    const result = neighborhoods.map((n) => {
      const id = String(n._id);
      const requests = reqMap[id] || 0;
      const services = svcMap[id] || 0;
      const msk = mskMap[id] || 0;
      return {
        _id: n._id,
        name: n.name,
        requests,
        services,
        msk,
        total: requests + services + msk,
      };
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/**
 * GET /api/stats/users/demographics
 * Foydalanuvchilar va xonadonlar soni hududlar bo'yicha guruhlanib qaytariladi.
 * Drill-down: hech narsa→viloyatlar, regionId→tumanlar, districtId→mahallalar, neighborhoodId→ko'chalar.
 *
 * @param {object} req.query - { regionId?, districtId?, neighborhoodId? }
 * @returns {{ summary: object, byLevel: Array }}
 */
const getUserDemographics = async (req, res) => {
  try {
    const { regionId, districtId, neighborhoodId } = req.query;
    const baseMatch = buildUserMatchStage(req.query, req.user, false);

    // Guruh darajasini va Region lookup filtrini aniqlash
    let groupField, regionDocs;
    if (neighborhoodId) {
      groupField = "address.street";
      regionDocs = await Region.find({
        type: "street",
        parent: neighborhoodId,
        isActive: true,
      })
        .select("_id name")
        .lean();
    } else if (districtId) {
      groupField = "address.neighborhood";
      regionDocs = await Region.find({
        type: "neighborhood",
        parent: districtId,
        isActive: true,
      })
        .select("_id name")
        .lean();
    } else if (regionId) {
      groupField = "address.district";
      regionDocs = await Region.find({
        type: "district",
        parent: regionId,
        isActive: true,
      })
        .select("_id name")
        .lean();
    } else {
      groupField = "address.region";
      const isAdmin = req.user.role === "admin" && req.user.assignedRegion;
      const allRegions = await Region.find({ type: "region", isActive: true })
        .select("_id name")
        .lean();

      if (isAdmin) {
        // Admin uchun: aggregation natijasidagi IDlar bilan cheklash
        const tempMatch = { ...baseMatch };
        const agg = await User.aggregate([
          { $match: tempMatch },
          { $group: { _id: "$address.region" } },
        ]);
        const relevantIds = new Set(agg.map((r) => String(r._id)));
        regionDocs = allRegions.filter((r) => relevantIds.has(String(r._id)));
      } else {
        regionDocs = allRegions;
      }
    }

    // Drill-down filtr qo'shish (admin $or ni saqlagan holda)
    const match = { ...baseMatch };
    if (neighborhoodId) {
      applyDrillDown(match, {
        "address.neighborhood": new ObjectId(neighborhoodId),
      });
    } else if (districtId) {
      applyDrillDown(match, { "address.district": new ObjectId(districtId) });
    } else if (regionId) {
      applyDrillDown(match, { "address.region": new ObjectId(regionId) });
    }

    // Xonadonlar uchun alohida match (houseNumber bo'sh emas)
    const householdMatch = { ...match, "address.houseNumber": { $nin: [null, ""] } };

    const [
      totalUsers,
      activeUsers,
      userCounts,
      householdCounts,
      householdSummary,
    ] = await Promise.all([
      // Jami foydalanuvchilar
      User.countDocuments(match),

      // Faol foydalanuvchilar
      User.countDocuments({ ...match, isActive: true }),

      // Foydalanuvchilar hudud bo'yicha
      User.aggregate([
        { $match: match },
        {
          $group: {
            _id: `$${groupField}`,
            totalUsers: { $sum: 1 },
            activeUsers: { $sum: { $cond: ["$isActive", 1, 0] } },
          },
        },
      ]),

      // Xonadonlar soni hudud bo'yicha (2-bosqichli aggregation)
      User.aggregate([
        { $match: householdMatch },
        // 1-bosqich: noyob xonadon kombinatsiyasi
        {
          $group: {
            _id: {
              levelId: `$${groupField}`,
              region: "$address.region",
              district: "$address.district",
              neighborhood: "$address.neighborhood",
              street: "$address.street",
              houseNumber: "$address.houseNumber",
              apartment: {
                $cond: [
                  { $eq: ["$address.houseType", "apartment"] },
                  "$address.apartment",
                  null,
                ],
              },
              houseType: "$address.houseType",
            },
          },
        },
        // 2-bosqich: har bir hudud uchun noyob xonadonlarni sanash
        {
          $group: {
            _id: "$_id.levelId",
            totalHouseholds: { $sum: 1 },
            privateHouseholds: {
              $sum: {
                $cond: [{ $eq: ["$_id.houseType", "private"] }, 1, 0],
              },
            },
            apartmentHouseholds: {
              $sum: {
                $cond: [{ $eq: ["$_id.houseType", "apartment"] }, 1, 0],
              },
            },
          },
        },
      ]),

      // Global xonadonlar summary
      User.aggregate([
        { $match: householdMatch },
        {
          $group: {
            _id: {
              region: "$address.region",
              district: "$address.district",
              neighborhood: "$address.neighborhood",
              street: "$address.street",
              houseNumber: "$address.houseNumber",
              apartment: {
                $cond: [
                  { $eq: ["$address.houseType", "apartment"] },
                  "$address.apartment",
                  null,
                ],
              },
              houseType: "$address.houseType",
            },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            private: {
              $sum: {
                $cond: [{ $eq: ["$_id.houseType", "private"] }, 1, 0],
              },
            },
            apartment: {
              $sum: {
                $cond: [{ $eq: ["$_id.houseType", "apartment"] }, 1, 0],
              },
            },
          },
        },
      ]),
    ]);

    const userMap = Object.fromEntries(
      userCounts.map((r) => [String(r._id), r]),
    );
    const householdMap = Object.fromEntries(
      householdCounts.map((r) => [String(r._id), r]),
    );

    const byLevel = regionDocs.map((doc) => {
      const id = String(doc._id);
      const u = userMap[id] || { totalUsers: 0, activeUsers: 0 };
      const h = householdMap[id] || {
        totalHouseholds: 0,
        privateHouseholds: 0,
        apartmentHouseholds: 0,
      };
      return {
        _id: doc._id,
        name: doc.name,
        totalUsers: u.totalUsers,
        activeUsers: u.activeUsers,
        inactiveUsers: u.totalUsers - u.activeUsers,
        totalHouseholds: h.totalHouseholds,
        privateHouseholds: h.privateHouseholds,
        apartmentHouseholds: h.apartmentHouseholds,
        activityRate:
          u.totalUsers > 0
            ? Math.round((u.activeUsers / u.totalUsers) * 100)
            : 0,
      };
    });

    const hhSum = householdSummary[0] || { total: 0, private: 0, apartment: 0 };

    res.json({
      summary: {
        totalUsers,
        activeUsers,
        inactiveUsers: totalUsers - activeUsers,
        totalHouseholds: hhSum.total,
        privateHouseholds: hhSum.private,
        apartmentHouseholds: hhSum.apartment,
      },
      byLevel,
    });
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
  getByNeighborhood,
  getUserStats,
  getUsersByRegion,
  getUsersByDistrict,
  getUserDemographics,
};
