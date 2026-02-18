const User = require("../models/user.model");

/** GET /api/admins */
const getAll = async (req, res) => {
  try {
    const admins = await User.find({ role: "admin" })
      .sort({ createdAt: -1 })
      .populate("assignedRegion.region", "name type");

    res.json(admins);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** POST /api/admins */
const create = async (req, res) => {
  try {
    const { phone, password, firstName, lastName, alias } = req.body;

    if (!phone || !password || !alias) {
      return res
        .status(400)
        .json({ message: "Telefon raqam, parol va tahallus kiritilishi shart" });
    }

    const existing = await User.findOne({ phone });
    if (existing) {
      return res
        .status(400)
        .json({ message: "Bu telefon raqam allaqachon ro'yxatdan o'tgan" });
    }

    const admin = await User.create({
      phone,
      password,
      firstName: firstName || "",
      lastName: lastName || "",
      alias,
      role: "admin",
    });

    res.status(201).json(admin);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** PUT /api/admins/:id */
const update = async (req, res) => {
  try {
    const { firstName, lastName, alias, isActive, password } = req.body;
    const admin = await User.findOne({ _id: req.params.id, role: "admin" });

    if (!admin) {
      return res.status(404).json({ message: "Admin topilmadi" });
    }

    if (firstName !== undefined) admin.firstName = firstName;
    if (lastName !== undefined) admin.lastName = lastName;
    if (alias !== undefined) admin.alias = alias;
    if (isActive !== undefined) admin.isActive = isActive;
    if (password) admin.password = password;

    await admin.save();
    res.json(admin);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** DELETE /api/admins/:id */
const remove = async (req, res) => {
  try {
    const admin = await User.findOne({ _id: req.params.id, role: "admin" });
    if (!admin) {
      return res.status(404).json({ message: "Admin topilmadi" });
    }

    await admin.deleteOne();
    res.json({ message: "Admin o'chirildi" });
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** PUT /api/admins/:id/region */
const setRegion = async (req, res) => {
  try {
    const { assignedRegion } = req.body;

    const admin = await User.findOneAndUpdate(
      { _id: req.params.id, role: "admin" },
      { $set: { assignedRegion: assignedRegion || null } },
      { new: true },
    ).populate("assignedRegion.region", "name type");

    if (!admin) {
      return res.status(404).json({ message: "Admin topilmadi" });
    }

    res.json(admin);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** GET /api/admins/:id */
const getById = async (req, res) => {
  try {
    const admin = await User.findOne({ _id: req.params.id, role: "admin" })
      .populate("assignedRegion.region", "name type")
      .populate("permissions.requests.allowedTypes", "name")
      .populate("permissions.services.allowedTypes", "name icon")
      .populate("permissions.msk.allowedCategories", "name icon");

    if (!admin) {
      return res.status(404).json({ message: "Admin topilmadi" });
    }

    res.json(admin);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** PUT /api/admins/:id/permissions */
const updatePermissions = async (req, res) => {
  try {
    const { permissions } = req.body;
    const admin = await User.findOne({ _id: req.params.id, role: "admin" });

    if (!admin) {
      return res.status(404).json({ message: "Admin topilmadi" });
    }

    admin.permissions = permissions;
    await admin.save();

    const populated = await User.findById(admin._id)
      .populate("assignedRegion.region", "name type")
      .populate("permissions.requests.allowedTypes", "name")
      .populate("permissions.services.allowedTypes", "name icon")
      .populate("permissions.msk.allowedCategories", "name icon");

    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

module.exports = { getAll, getById, create, update, remove, setRegion, updatePermissions };
