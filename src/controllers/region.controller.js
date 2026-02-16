const Region = require("../models/region.model");

/** GET /api/regions */
const getAll = async (req, res) => {
  try {
    const { type, parent } = req.query;
    const filter = {};

    if (type) filter.type = type;
    if (parent) filter.parent = parent;
    else if (type === "region") filter.parent = null;

    const regions = await Region.find(filter).sort({ name: 1 });
    res.json(regions);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** GET /api/regions/:id */
const getById = async (req, res) => {
  try {
    const region = await Region.findById(req.params.id).populate(
      "parent",
      "name type",
    );
    if (!region) {
      return res.status(404).json({ message: "Hudud topilmadi" });
    }
    res.json(region);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** POST /api/regions */
const create = async (req, res) => {
  try {
    const { name, type, parent } = req.body;

    if (!name || !type) {
      return res.status(400).json({ message: "Nom va tur kiritilishi shart" });
    }

    const existing = await Region.findOne({ name, type, parent: parent || null });
    if (existing) {
      return res.status(400).json({ message: "Bunday hudud allaqachon mavjud" });
    }

    const region = await Region.create({
      name,
      type,
      parent: parent || null,
    });

    res.status(201).json(region);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** PUT /api/regions/:id */
const update = async (req, res) => {
  try {
    const { name, isActive } = req.body;
    const region = await Region.findById(req.params.id);

    if (!region) {
      return res.status(404).json({ message: "Hudud topilmadi" });
    }

    if (name !== undefined) region.name = name;
    if (isActive !== undefined) region.isActive = isActive;

    await region.save();
    res.json(region);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** DELETE /api/regions/:id */
const remove = async (req, res) => {
  try {
    const region = await Region.findById(req.params.id);
    if (!region) {
      return res.status(404).json({ message: "Hudud topilmadi" });
    }

    const children = await Region.countDocuments({ parent: region._id });
    if (children > 0) {
      return res
        .status(400)
        .json({ message: "Bu hududda pastki hududlar mavjud, avval ularni o'chiring" });
    }

    await region.deleteOne();
    res.json({ message: "Hudud o'chirildi" });
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

module.exports = { getAll, getById, create, update, remove };
