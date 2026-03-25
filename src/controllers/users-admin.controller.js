const mongoose = require("mongoose");
const User = require("../models/user.model");

const { ObjectId } = mongoose.Types;

/**
 * Cleans a string id and returns it, or null if invalid.
 * @param {string} id
 * @returns {string|null}
 */
function cleanId(id) {
  if (!id || !mongoose.isValidObjectId(id)) return null;
  return id;
}

/**
 * Builds a MongoDB match object for filtering users (role="user")
 * by region hierarchy and optional filters.
 *
 * @param {object} query - req.query (regionId, districtId, neighborhoodId, houseType, isActive)
 * @param {object} user  - req.user
 * @returns {object} match object
 */
function buildMatch(query, user) {
  const regionId = cleanId(query.regionId);
  const districtId = cleanId(query.districtId);
  const neighborhoodId = cleanId(query.neighborhoodId);

  const match = { role: "user" };

  // Admin faqat o'ziga biriktirilgan hudud userlarini ko'radi
  if (user.role === "admin" && user.assignedRegion?.region) {
    const rid = user.assignedRegion.region;
    match["$or"] = [
      { "address.region": rid },
      { "address.district": rid },
      { "address.neighborhood": rid },
      { "address.street": rid },
    ];
  }

  // Owner qo'shimcha filtrlar qo'llay oladi
  if (user.role === "owner") {
    if (neighborhoodId) {
      match["address.neighborhood"] = new ObjectId(neighborhoodId);
    } else if (districtId) {
      match["address.district"] = new ObjectId(districtId);
    } else if (regionId) {
      match["address.region"] = new ObjectId(regionId);
    }
  }

  if (query.houseType === "private" || query.houseType === "apartment") {
    match["address.houseType"] = query.houseType;
  }

  if (query.isActive === "true") match.isActive = true;
  if (query.isActive === "false") match.isActive = false;

  return match;
}

/**
 * GET /api/admin/users
 * Paginated list of users with region filters.
 *
 * @param {object} req - Express request (query: regionId, districtId, neighborhoodId, houseType, isActive, page, limit)
 * @param {object} res - Express response
 */
const getAll = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const match = buildMatch(req.query, req.user);

    const [users, total] = await Promise.all([
      User.find(match)
        .select("firstName lastName phone isActive address createdAt")
        .populate("address.region", "name")
        .populate("address.district", "name")
        .populate("address.neighborhood", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(match),
    ]);

    res.json({
      users,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/**
 * GET /api/admin/users/stats
 * Aggregate stats: total, active/inactive, houseType counts, per-region breakdown.
 *
 * @param {object} req - Express request (query: regionId, districtId, neighborhoodId)
 * @param {object} res - Express response
 */
const getStats = async (req, res) => {
  try {
    const match = buildMatch(req.query, req.user);

    const [counts, byHouseType, byRegion] = await Promise.all([
      // Jami, faol, nofaol
      User.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            active: { $sum: { $cond: ["$isActive", 1, 0] } },
            inactive: { $sum: { $cond: ["$isActive", 0, 1] } },
          },
        },
      ]),

      // Uy turi bo'yicha
      User.aggregate([
        { $match: match },
        { $group: { _id: "$address.houseType", count: { $sum: 1 } } },
      ]),

      // Viloyat bo'yicha (faqat owner uchun, admin uchun ortiqcha)
      User.aggregate([
        { $match: { ...match, "address.region": { $exists: true, $ne: null } } },
        {
          $group: {
            _id: "$address.region",
            count: { $sum: 1 },
          },
        },
        {
          $lookup: {
            from: "regions",
            localField: "_id",
            foreignField: "_id",
            as: "region",
          },
        },
        { $unwind: { path: "$region", preserveNullAndEmpty: true } },
        {
          $project: {
            _id: 1,
            name: "$region.name",
            count: 1,
          },
        },
        { $sort: { count: -1 } },
        { $limit: 20 },
      ]),
    ]);

    const totals = counts[0] || { total: 0, active: 0, inactive: 0 };

    const houseTypeMap = {};
    byHouseType.forEach((item) => {
      if (item._id) houseTypeMap[item._id] = item.count;
    });

    res.json({
      total: totals.total,
      active: totals.active,
      inactive: totals.inactive,
      private: houseTypeMap.private || 0,
      apartment: houseTypeMap.apartment || 0,
      byRegion,
    });
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

module.exports = { getAll, getStats };
