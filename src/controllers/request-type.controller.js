const RequestType = require("../models/request-type.model");

/** GET /api/request-types */
const getAll = async (req, res) => {
  try {
    const types = await RequestType.find({ isActive: true }).sort({ name: 1 });
    res.json(types);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** POST /api/request-types */
const create = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ message: "Murojaat turi nomi kiritilishi shart" });
    }

    const existing = await RequestType.findOne({ name });
    if (existing) {
      return res.status(400).json({ message: "Bunday murojaat turi allaqachon mavjud" });
    }

    const type = await RequestType.create({ name });
    res.status(201).json(type);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** PUT /api/request-types/:id */
const update = async (req, res) => {
  try {
    const { name, isActive } = req.body;
    const type = await RequestType.findById(req.params.id);
    if (!type) {
      return res.status(404).json({ message: "Murojaat turi topilmadi" });
    }

    if (name !== undefined) type.name = name;
    if (isActive !== undefined) type.isActive = isActive;

    await type.save();
    res.json(type);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** DELETE /api/request-types/:id */
const remove = async (req, res) => {
  try {
    const type = await RequestType.findById(req.params.id);
    if (!type) {
      return res.status(404).json({ message: "Murojaat turi topilmadi" });
    }

    await type.deleteOne();
    res.json({ message: "Murojaat turi o'chirildi" });
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

module.exports = { getAll, create, update, remove };
