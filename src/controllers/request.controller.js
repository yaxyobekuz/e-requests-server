const Request = require("../models/request.model");

/** POST /api/requests */
const create = async (req, res) => {
  try {
    const { category, description, contactFirstName, contactLastName, contactPhone } = req.body;

    if (!category || !description || !contactFirstName || !contactLastName || !contactPhone) {
      return res.status(400).json({ message: "Barcha maydonlar to'ldirilishi shart" });
    }

    const user = req.user;
    if (!user.address) {
      return res.status(400).json({ message: "Avval hududingizni belgilang" });
    }

    const request = await Request.create({
      user: user._id,
      category,
      description,
      contactFirstName,
      contactLastName,
      contactPhone,
      address: user.address,
    });

    res.status(201).json(request);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** GET /api/requests/my */
const getMyRequests = async (req, res) => {
  try {
    const requests = await Request.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .populate("address.region address.district address.neighborhood address.street", "name");

    res.json(requests);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** PUT /api/requests/:id */
const update = async (req, res) => {
  try {
    const request = await Request.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!request) {
      return res.status(404).json({ message: "Murojaat topilmadi" });
    }

    if (request.status !== "pending") {
      return res.status(400).json({
        message: "Faqat 'Kutilmoqda' statusidagi murojaatlarni tahrirlash mumkin",
      });
    }

    const { description, contactFirstName, contactLastName, contactPhone, category } = req.body;

    if (description !== undefined) request.description = description;
    if (contactFirstName !== undefined) request.contactFirstName = contactFirstName;
    if (contactLastName !== undefined) request.contactLastName = contactLastName;
    if (contactPhone !== undefined) request.contactPhone = contactPhone;
    if (category !== undefined) request.category = category;

    await request.save();
    res.json(request);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** GET /api/requests (admin) */
const getAll = async (req, res) => {
  try {
    const { status, category, type, regionId, page = 1, limit = 20 } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (category) filter.category = category;
    if (type) filter.type = type;

    if (req.user.role === "admin" && req.user.assignedRegion) {
      const rid = req.user.assignedRegion.region;
      filter["$or"] = [
        { "address.region": rid },
        { "address.district": rid },
        { "address.neighborhood": rid },
        { "address.street": rid },
      ];
    }

    if (regionId) {
      filter["$or"] = [
        { "address.region": regionId },
        { "address.district": regionId },
        { "address.neighborhood": regionId },
        { "address.street": regionId },
      ];
    }

    // Permission: ruxsat berilgan murojaat turlari bo'yicha filtrlash
    if (req.allowedTypes && req.allowedTypes.length > 0) {
      filter.type = { $in: req.allowedTypes };
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [requests, total] = await Promise.all([
      Request.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("user", "firstName lastName phone")
        .populate("address.region address.district address.neighborhood address.street", "name")
        .populate("assignedAdmin", "firstName alias")
        .populate("type", "name"),
      Request.countDocuments(filter),
    ]);

    res.json({ data: requests, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** PUT /api/requests/:id/status (admin) */
const updateStatus = async (req, res) => {
  try {
    const { status, rejectionReason, closingNote, type } = req.body;
    const request = await Request.findById(req.params.id);

    if (!request) {
      return res.status(404).json({ message: "Murojaat topilmadi" });
    }

    if (status === "rejected" && !rejectionReason) {
      return res.status(400).json({ message: "Rad etish sababi kiritilishi shart" });
    }

    request.status = status;
    if (status === "in_review") request.assignedAdmin = req.user._id;
    if (rejectionReason) request.rejectionReason = rejectionReason;
    if (closingNote) request.closingNote = closingNote;
    if (type !== undefined) request.type = type || null;

    await request.save();

    const populated = await Request.findById(request._id)
      .populate("user", "firstName lastName phone")
      .populate("address.region address.district address.neighborhood address.street", "name")
      .populate("assignedAdmin", "firstName alias")
      .populate("type", "name");

    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** PUT /api/requests/:id/cancel (user) */
const cancelRequest = async (req, res) => {
  try {
    const { cancelReason } = req.body;
    const request = await Request.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!request) {
      return res.status(404).json({ message: "Murojaat topilmadi" });
    }

    if (["resolved", "rejected", "cancelled"].includes(request.status)) {
      return res.status(400).json({ message: "Bu murojaatni bekor qilib bo'lmaydi" });
    }

    request.status = "cancelled";
    if (cancelReason) request.cancelReason = cancelReason.trim();
    await request.save();

    res.json(request);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** GET /api/requests/stats */
const getStats = async (req, res) => {
  try {
    const { regionId } = req.query;
    const match = {};

    if (regionId) {
      match["$or"] = [
        { "address.region": require("mongoose").Types.ObjectId.createFromHexString(regionId) },
        { "address.district": require("mongoose").Types.ObjectId.createFromHexString(regionId) },
        { "address.neighborhood": require("mongoose").Types.ObjectId.createFromHexString(regionId) },
        { "address.street": require("mongoose").Types.ObjectId.createFromHexString(regionId) },
      ];
    } else if (req.user.role === "admin" && req.user.assignedRegion) {
      const rid = require("mongoose").Types.ObjectId.createFromHexString(req.user.assignedRegion.region.toString());
      match["$or"] = [
        { "address.region": rid },
        { "address.district": rid },
        { "address.neighborhood": rid },
        { "address.street": rid },
      ];
    }

    // Permission: ruxsat berilgan murojaat turlari bo'yicha filtrlash
    if (req.allowedTypes && req.allowedTypes.length > 0) {
      match.type = { $in: req.allowedTypes.map((id) => require("mongoose").Types.ObjectId.createFromHexString(id.toString())) };
    }

    const stats = await Request.aggregate([
      { $match: match },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    const result = {
      total: 0,
      pending: 0,
      in_review: 0,
      resolved: 0,
      rejected: 0,
    };

    stats.forEach((s) => {
      result[s._id] = s.count;
      result.total += s.count;
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

module.exports = { create, getMyRequests, update, getAll, updateStatus, cancelRequest, getStats };
