const AdminRole = require("../models/admin-role.model");
const User = require("../models/user.model");

/** GET /api/admin-roles */
const getAll = async (req, res) => {
  try {
    const roles = await AdminRole.find().sort({ name: 1 });
    res.json(roles);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** POST /api/admin-roles */
const create = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Lavozim nomi kiritilishi shart" });
    }

    const existing = await AdminRole.findOne({ name: name.trim() });
    if (existing) {
      return res.status(400).json({ message: "Bu nomli lavozim allaqachon mavjud" });
    }

    const role = await AdminRole.create({ name: name.trim(), description: description || "" });
    res.status(201).json(role);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** PUT /api/admin-roles/:id */
const update = async (req, res) => {
  try {
    const { name, description } = req.body;
    const role = await AdminRole.findById(req.params.id);

    if (!role) {
      return res.status(404).json({ message: "Lavozim topilmadi" });
    }

    if (name !== undefined) role.name = name.trim();
    if (description !== undefined) role.description = description;

    await role.save();
    res.json(role);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** DELETE /api/admin-roles/:id */
const remove = async (req, res) => {
  try {
    const role = await AdminRole.findById(req.params.id);
    if (!role) {
      return res.status(404).json({ message: "Lavozim topilmadi" });
    }

    const inUse = await User.exists({ adminRole: req.params.id });
    if (inUse) {
      return res
        .status(400)
        .json({ message: "Bu lavozim adminlarga tayinlangan, avval adminlardan olib tashlang" });
    }

    await role.deleteOne();
    res.json({ message: "Lavozim o'chirildi" });
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

module.exports = { getAll, create, update, remove };
