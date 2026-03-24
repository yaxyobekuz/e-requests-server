const mongoose = require("mongoose");
const Harvest = require("../models/harvest.model");
const Product = require("../models/product.model");

const {
  Types: { ObjectId },
} = mongoose;

/**
 * Yangi hosil yozuvi yaratadi (faqat fuqaro).
 * Foydalanuvchi manzilindan snapshot olinadi.
 * @route POST /api/harvest
 */
exports.createHarvest = async (req, res) => {
  try {
    const { productId, varietyId, area, amount, year, season } = req.body;

    if (!productId || !varietyId || !area || !amount || !year) {
      return res
        .status(400)
        .json({ message: "Barcha majburiy maydonlarni to'ldiring" });
    }

    const product = await Product.findById(productId);
    if (!product)
      return res.status(404).json({ message: "Mahsulot topilmadi" });

    const variety = product.varieties.id(varietyId);
    if (!variety) return res.status(404).json({ message: "Nav topilmadi" });

    const user = req.user;
    const address = user.address
      ? {
          region: user.address.region || null,
          district: user.address.district || null,
          neighborhood: user.address.neighborhood || null,
          street: user.address.street || null,
        }
      : {};

    const harvest = await Harvest.create({
      user: user._id,
      product: productId,
      varietyId,
      varietyName: variety.name,
      area: Number(area),
      amount: Number(amount),
      year: Number(year),
      season: season || null,
      address,
    });

    res.status(201).json(harvest);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * Fuqaroning o'z hosil tarixini sahifalab qaytaradi.
 * @route GET /api/harvest/my
 * @query {number} page - sahifa raqami (default 1)
 * @query {number} limit - bir sahifadagi yozuvlar soni (default 10)
 */
exports.getMyHarvest = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 10);
    const skip = (page - 1) * limit;

    const filter = { user: req.user._id };

    const [data, total] = await Promise.all([
      Harvest.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("product", "name"),
      Harvest.countDocuments(filter),
    ]);

    res.json({
      data,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * Fuqaro o'zining hosil yozuvini o'chiradi.
 * @route DELETE /api/harvest/:id
 */
exports.deleteMyHarvest = async (req, res) => {
  try {
    const harvest = await Harvest.findOne({
      _id: req.params.id,
      user: req.user._id,
    });
    if (!harvest) return res.status(404).json({ message: "Yozuv topilmadi" });

    await harvest.deleteOne();
    res.json({ message: "Yozuv o'chirildi" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * Hosil statistikasini mahsulot, nav va hudud bo'yicha agregatsiya qiladi.
 * Admin o'z hududiga cheklanadi, owner filter qila oladi.
 * @route GET /api/harvest/stats/overview
 * @query {string} productId - mahsulot ID (ixtiyoriy)
 * @query {string} varietyId - nav ID (ixtiyoriy)
 * @query {string} regionId - hudud ID (ixtiyoriy)
 * @query {number} year - yil (ixtiyoriy)
 * @query {string} season - fasl (ixtiyoriy): bahor, yoz, kuz, qish
 */
exports.getStatsOverview = async (req, res) => {
  try {
    const { productId, varietyId, regionId, year, season } = req.query;
    const user = req.user;

    const matchStage = {};

    if (productId) matchStage.product = new ObjectId(productId);
    if (varietyId) matchStage.varietyId = new ObjectId(varietyId);
    if (year) matchStage.year = Number(year);
    if (season) matchStage.season = season;

    if (user.role === "admin" && user.assignedRegion) {
      const rid = user.assignedRegion.region;
      matchStage["$or"] = [
        { "address.region": rid },
        { "address.district": rid },
        { "address.neighborhood": rid },
        { "address.street": rid },
      ];
    } else if (user.role === "owner" && regionId) {
      matchStage["address.region"] = new ObjectId(regionId);
    }

    const results = await Harvest.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            product: "$product",
            varietyId: "$varietyId",
            region: "$address.region",
          },
          totalAmount: { $sum: "$amount" },
          totalArea: { $sum: "$area" },
          count: { $sum: 1 },
          minPerSotix: { $min: { $divide: ["$amount", "$area"] } },
          maxPerSotix: { $max: { $divide: ["$amount", "$area"] } },
          varietyName: { $first: "$varietyName" },
        },
      },
      {
        $addFields: {
          avgPerSotix: { $divide: ["$totalAmount", "$totalArea"] },
        },
      },
      {
        $lookup: {
          from: "products",
          localField: "_id.product",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
      {
        $lookup: {
          from: "regions",
          localField: "_id.region",
          foreignField: "_id",
          as: "region",
        },
      },
      { $unwind: { path: "$region", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          productId: "$_id.product",
          productName: "$product.name",
          varietyId: "$_id.varietyId",
          varietyName: 1,
          regionId: "$_id.region",
          regionName: "$region.name",
          avgPerSotix: { $round: ["$avgPerSotix", 2] },
          minPerSotix: { $round: ["$minPerSotix", 2] },
          maxPerSotix: { $round: ["$maxPerSotix", 2] },
          count: 1,
        },
      },
      { $sort: { avgPerSotix: -1 } },
    ]);

    res.json(results);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * Hosil statistikasini hududlar bo'yicha qaytaradi.
 * @route GET /api/harvest/stats/by-region
 */
exports.getStatsByRegion = async (req, res) => {
  try {
    const { productId, varietyId, year, season } = req.query;
    const user = req.user;

    const matchStage = {};
    if (productId) matchStage.product = new ObjectId(productId);
    if (varietyId) matchStage.varietyId = new ObjectId(varietyId);
    if (year) matchStage.year = Number(year);
    if (season) matchStage.season = season;

    if (user.role === "admin" && user.assignedRegion) {
      const rid = user.assignedRegion.region;
      matchStage["$or"] = [
        { "address.region": rid },
        { "address.district": rid },
        { "address.neighborhood": rid },
        { "address.street": rid },
      ];
    }

    const results = await Harvest.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$address.region",
          totalAmount: { $sum: "$amount" },
          totalArea: { $sum: "$area" },
          count: { $sum: 1 },
        },
      },
      {
        $addFields: {
          avgPerSotix: {
            $cond: [
              { $gt: ["$totalArea", 0] },
              { $round: [{ $divide: ["$totalAmount", "$totalArea"] }, 2] },
              0,
            ],
          },
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
      { $unwind: { path: "$region", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          regionId: "$_id",
          regionName: "$region.name",
          totalAmount: 1,
          totalArea: 1,
          avgPerSotix: 1,
          count: 1,
        },
      },
      { $sort: { avgPerSotix: -1 } },
    ]);

    res.json(results);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * Hosil statistikasini tanlangan viloyat tumanlari bo'yicha qaytaradi.
 * @route GET /api/harvest/stats/by-district/:regionId
 * @param {string} regionId - viloyat ID
 * @query {string} productId - mahsulot ID (ixtiyoriy)
 * @query {string} varietyId - nav ID (ixtiyoriy)
 * @query {number} year - yil (ixtiyoriy)
 * @query {string} season - fasl (ixtiyoriy)
 */
exports.getStatsByDistrict = async (req, res) => {
  try {
    const { regionId } = req.params;
    const { productId, varietyId, year, season } = req.query;

    const matchStage = { "address.region": new ObjectId(regionId) };
    if (productId) matchStage.product = new ObjectId(productId);
    if (varietyId) matchStage.varietyId = new ObjectId(varietyId);
    if (year) matchStage.year = Number(year);
    if (season) matchStage.season = season;

    const user = req.user;
    if (user.role === "admin" && user.assignedRegion) {
      const rid = user.assignedRegion.region;
      matchStage["$or"] = [
        { "address.region": rid },
        { "address.district": rid },
        { "address.neighborhood": rid },
        { "address.street": rid },
      ];
    }

    const results = await Harvest.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$address.district",
          totalAmount: { $sum: "$amount" },
          totalArea: { $sum: "$area" },
          count: { $sum: 1 },
        },
      },
      {
        $addFields: {
          avgPerSotix: {
            $cond: [
              { $gt: ["$totalArea", 0] },
              { $round: [{ $divide: ["$totalAmount", "$totalArea"] }, 2] },
              0,
            ],
          },
        },
      },
      {
        $lookup: {
          from: "regions",
          localField: "_id",
          foreignField: "_id",
          as: "district",
        },
      },
      { $unwind: { path: "$district", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          districtId: "$_id",
          districtName: "$district.name",
          totalAmount: 1,
          totalArea: 1,
          avgPerSotix: 1,
          count: 1,
        },
      },
      { $sort: { avgPerSotix: -1 } },
    ]);

    res.json(results);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
