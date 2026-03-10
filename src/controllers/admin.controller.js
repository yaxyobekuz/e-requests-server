const User = require("../models/user.model");
const Region = require("../models/region.model");
const { validatePermissionsSubset } = require("../utils/permissions.util");

/**
 * Checks if requestedRegionId is the same as callerRegionId or a descendant of it.
 * Traverses the region parent chain upward from the requested region.
 * @param {string|ObjectId} requestedRegionId
 * @param {string|ObjectId} callerRegionId
 * @returns {Promise<boolean>}
 */
const isRegionWithinCaller = async (requestedRegionId, callerRegionId) => {
  if (requestedRegionId.toString() === callerRegionId.toString()) return true;
  let curId = requestedRegionId;
  for (let i = 0; i < 4; i++) {
    const region = await Region.findById(curId).select("parent");
    if (!region || !region.parent) return false;
    if (region.parent.toString() === callerRegionId.toString()) return true;
    curId = region.parent;
  }
  return false;
};

const ADMIN_POPULATE = [
  { path: "assignedRegion.region", select: "name type" },
  { path: "adminRole", select: "name description" },
];

const ADMIN_DETAIL_POPULATE = [
  { path: "assignedRegion.region", select: "name type" },
  { path: "adminRole", select: "name description" },
  { path: "permissions.requests.allowedTypes", select: "name" },
  { path: "permissions.services.allowedTypes", select: "name icon" },
  { path: "permissions.msk.allowedCategories", select: "name icon" },
];

/** GET /api/admins */
const getAll = async (req, res) => {
  try {
    const filter = { role: "admin" };
    if (req.isDelegatedManager) {
      filter.createdBy = req.user._id;
    }

    const admins = await User.find(filter)
      .sort({ createdAt: -1 })
      .populate(ADMIN_POPULATE);

    res.json(admins);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** POST /api/admins */
const create = async (req, res) => {
  try {
    const { phone, password, firstName, lastName, alias, adminRole, permissions, assignedRegion } = req.body;

    if (!phone || !password || !alias) {
      return res
        .status(400)
        .json({ message: "Telefon raqam, parol va tahallus kiritilishi shart" });
    }

    if (!adminRole) {
      return res.status(400).json({ message: "Lavozim tanlanishi shart" });
    }

    const existing = await User.findOne({ phone });
    if (existing) {
      return res
        .status(400)
        .json({ message: "Bu telefon raqam allaqachon ro'yxatdan o'tgan" });
    }

    if (req.isDelegatedManager) {
      // Permission subset tekshiruvi
      if (permissions) {
        const check = validatePermissionsSubset(permissions, req.user.permissions);
        if (!check.valid) {
          return res.status(403).json({ message: check.message });
        }
      }

      // Region tekshiruvi: delegat admin faqat o'z hududi yoki uning quyi hududini bera oladi
      if (assignedRegion && req.user.assignedRegion) {
        const callerRegionId = req.user.assignedRegion.region.toString();
        const requestedRegionId = assignedRegion.region?.toString() || assignedRegion.toString();
        const allowed = await isRegionWithinCaller(requestedRegionId, callerRegionId);
        if (!allowed) {
          return res
            .status(403)
            .json({ message: "Siz faqat o'z hududingiz doirasida ruxsat bera olasiz" });
        }
      }
    }

    const adminData = {
      phone,
      password,
      firstName: firstName || "",
      lastName: lastName || "",
      alias,
      role: "admin",
      adminRole,
    };

    if (req.isDelegatedManager) {
      adminData.createdBy = req.user._id;
      adminData.canManageAdmins = false;
      if (permissions) adminData.permissions = permissions;
      if (assignedRegion) adminData.assignedRegion = assignedRegion;
    }

    const admin = await User.create(adminData);
    const populated = await User.findById(admin._id).populate(ADMIN_POPULATE);
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** PUT /api/admins/:id */
const update = async (req, res) => {
  try {
    const filter = { _id: req.params.id, role: "admin" };
    if (req.isDelegatedManager) {
      filter.createdBy = req.user._id;
    }

    const { firstName, lastName, alias, isActive, password } = req.body;
    const admin = await User.findOne(filter);

    if (!admin) {
      return res.status(404).json({ message: "Admin topilmadi" });
    }

    if (firstName !== undefined) admin.firstName = firstName;
    if (lastName !== undefined) admin.lastName = lastName;
    if (alias !== undefined) admin.alias = alias;
    if (isActive !== undefined) admin.isActive = isActive;
    if (password) admin.password = password;

    await admin.save();
    const populated = await User.findById(admin._id).populate(ADMIN_POPULATE);
    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** DELETE /api/admins/:id */
const remove = async (req, res) => {
  try {
    const filter = { _id: req.params.id, role: "admin" };
    if (req.isDelegatedManager) {
      filter.createdBy = req.user._id;
    }

    const admin = await User.findOne(filter);
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

    const filter = { _id: req.params.id, role: "admin" };
    if (req.isDelegatedManager) {
      filter.createdBy = req.user._id;

      // Delegat admin faqat o'z hududi yoki quyi hududini bera oladi
      if (assignedRegion && req.user.assignedRegion) {
        const callerRegionId = req.user.assignedRegion.region.toString();
        const requestedRegionId = assignedRegion.region?.toString() || assignedRegion.toString();
        const allowed = await isRegionWithinCaller(requestedRegionId, callerRegionId);
        if (!allowed) {
          return res
            .status(403)
            .json({ message: "Siz faqat o'z hududingiz doirasida ruxsat bera olasiz" });
        }
      }
    }

    const admin = await User.findOneAndUpdate(
      filter,
      { $set: { assignedRegion: assignedRegion || null } },
      { new: true },
    ).populate(ADMIN_POPULATE);

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
    const filter = { _id: req.params.id, role: "admin" };
    if (req.isDelegatedManager) {
      filter.createdBy = req.user._id;
    }

    const admin = await User.findOne(filter).populate(ADMIN_DETAIL_POPULATE);

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
    const filter = { _id: req.params.id, role: "admin" };
    if (req.isDelegatedManager) {
      filter.createdBy = req.user._id;
    }

    const admin = await User.findOne(filter);

    if (!admin) {
      return res.status(404).json({ message: "Admin topilmadi" });
    }

    if (req.isDelegatedManager && permissions) {
      const check = validatePermissionsSubset(permissions, req.user.permissions);
      if (!check.valid) {
        return res.status(403).json({ message: check.message });
      }
    }

    admin.permissions = permissions;
    await admin.save();

    const populated = await User.findById(admin._id).populate(ADMIN_DETAIL_POPULATE);
    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** PUT /api/admins/:id/delegation */
const updateDelegation = async (req, res) => {
  try {
    const { canManageAdmins } = req.body;
    const filter = { _id: req.params.id, role: "admin" };
    if (req.isDelegatedManager) {
      filter.createdBy = req.user._id;
    }

    const admin = await User.findOne(filter);
    if (!admin) {
      return res.status(404).json({ message: "Admin topilmadi" });
    }

    admin.canManageAdmins = !!canManageAdmins;
    await admin.save();

    const populated = await User.findById(admin._id).populate(ADMIN_POPULATE);
    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

module.exports = { getAll, getById, create, update, remove, setRegion, updatePermissions, updateDelegation };
