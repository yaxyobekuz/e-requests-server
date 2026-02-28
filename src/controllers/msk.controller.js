const MskCategory = require("../models/msk-category.model");
const MskOrder = require("../models/msk-order.model");

// ============ MSK CATEGORIES ============

/** GET /api/msk/categories */
const getCategories = async (req, res) => {
  try {
    const categories = await MskCategory.find({ isActive: true }).sort({ name: 1 });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** POST /api/msk/categories */
const createCategory = async (req, res) => {
  try {
    const { name, icon } = req.body;
    if (!name) {
      return res.status(400).json({ message: "Kategoriya nomi kiritilishi shart" });
    }

    const existing = await MskCategory.findOne({ name });
    if (existing) {
      return res.status(400).json({ message: "Bunday kategoriya allaqachon mavjud" });
    }

    const category = await MskCategory.create({ name, icon: icon || "" });
    res.status(201).json(category);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** PUT /api/msk/categories/:id */
const updateCategory = async (req, res) => {
  try {
    const { name, icon, isActive } = req.body;
    const category = await MskCategory.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: "Kategoriya topilmadi" });
    }

    if (name !== undefined) category.name = name;
    if (icon !== undefined) category.icon = icon;
    if (isActive !== undefined) category.isActive = isActive;

    await category.save();
    res.json(category);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** DELETE /api/msk/categories/:id */
const deleteCategory = async (req, res) => {
  try {
    const category = await MskCategory.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: "Kategoriya topilmadi" });
    }

    await category.deleteOne();
    res.json({ message: "Kategoriya o'chirildi" });
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

// ============ MSK ORDERS ============

/** POST /api/msk/orders */
const createOrder = async (req, res) => {
  try {
    const { categoryId, description, contactFirstName, contactLastName, contactPhone } = req.body;
    const user = req.user;

    if (!categoryId || !description || !contactFirstName || !contactLastName || !contactPhone) {
      return res.status(400).json({ message: "Barcha maydonlar to'ldirilishi shart" });
    }

    if (!user.address) {
      return res.status(400).json({ message: "Avval hududingizni belgilang" });
    }

    const order = await MskOrder.create({
      user: user._id,
      category: categoryId,
      description,
      contactFirstName,
      contactLastName,
      contactPhone,
      address: user.address,
    });

    const populated = await MskOrder.findById(order._id)
      .populate("category", "name icon")
      .populate("user", "firstName phone");

    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** GET /api/msk/orders/my */
const getMyOrders = async (req, res) => {
  try {
    const orders = await MskOrder.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .populate("category", "name icon")
      .populate("address.region address.district address.neighborhood address.street", "name");

    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** PUT /api/msk/orders/:id */
const updateOrder = async (req, res) => {
  try {
    const order = await MskOrder.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!order) {
      return res.status(404).json({ message: "Buyurtma topilmadi" });
    }

    if (order.status !== "pending") {
      return res.status(400).json({
        message: "Faqat 'Kutilmoqda' statusidagi buyurtmalarni tahrirlash mumkin",
      });
    }

    const { description, contactFirstName, contactLastName, contactPhone } = req.body;

    if (description !== undefined) order.description = description;
    if (contactFirstName !== undefined) order.contactFirstName = contactFirstName;
    if (contactLastName !== undefined) order.contactLastName = contactLastName;
    if (contactPhone !== undefined) order.contactPhone = contactPhone;

    await order.save();
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** GET /api/msk/orders */
const getAllOrders = async (req, res) => {
  try {
    const { categoryId, regionId, status, page = 1, limit = 20 } = req.query;
    const filter = {};

    if (categoryId) filter.category = categoryId;
    if (status) filter.status = status;

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

    // Permission: ruxsat berilgan MSK kategoriyalari bo'yicha filtrlash
    if (req.allowedMskCategories && req.allowedMskCategories.length > 0) {
      filter.category = { $in: req.allowedMskCategories };
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [orders, total] = await Promise.all([
      MskOrder.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("category", "name icon")
        .populate("user", "firstName phone")
        .populate("address.region address.district address.neighborhood address.street", "name")
        .populate("assignedAdmin", "firstName alias"),
      MskOrder.countDocuments(filter),
    ]);

    res.json({ data: orders, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** PUT /api/msk/orders/:id/status */
const updateOrderStatus = async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;
    const order = await MskOrder.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: "Buyurtma topilmadi" });
    }

    const allowedTransitions = {
      pending: ["in_review", "pending_confirmation", "rejected"],
      in_review: ["pending", "pending_confirmation", "rejected"],
      pending_confirmation: ["pending", "in_review", "rejected"],
    };

    const allowed = allowedTransitions[order.status];
    if (!allowed || !allowed.includes(status)) {
      return res.status(400).json({
        message: `"${order.status}" statusidan "${status}" statusiga o'tish mumkin emas`,
      });
    }

    if (status === "rejected" && !rejectionReason) {
      return res.status(400).json({ message: "Rad etish sababi kiritilishi shart" });
    }

    order.status = status;
    if (status === "in_review") order.assignedAdmin = req.user._id;
    if (rejectionReason) order.rejectionReason = rejectionReason;

    await order.save();

    const populated = await MskOrder.findById(order._id)
      .populate("category", "name icon")
      .populate("user", "firstName phone")
      .populate("assignedAdmin", "firstName alias");

    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** PUT /api/msk/orders/:id/confirm */
const confirmOrder = async (req, res) => {
  try {
    const { confirmed } = req.body;
    const order = await MskOrder.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!order) {
      return res.status(404).json({ message: "Buyurtma topilmadi" });
    }

    if (order.status !== "pending_confirmation") {
      return res.status(400).json({ message: "Faqat 'Tasdiq kutilmoqda' statusidagi buyurtmalarni tasdiqlash mumkin" });
    }

    order.confirmedByUser = confirmed;
    order.status = confirmed ? "confirmed" : "in_review";
    await order.save();

    res.json(order);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** PUT /api/msk/orders/:id/cancel (user) */
const cancelOrder = async (req, res) => {
  try {
    const { cancelReason } = req.body;
    const order = await MskOrder.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!order) {
      return res.status(404).json({ message: "Buyurtma topilmadi" });
    }

    if (["pending_confirmation", "confirmed", "rejected", "cancelled"].includes(order.status)) {
      return res.status(400).json({ message: "Bu buyurtmani bekor qilib bo'lmaydi" });
    }

    order.status = "cancelled";
    if (cancelReason) order.cancelReason = cancelReason.trim();
    await order.save();

    res.json(order);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

module.exports = {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  createOrder,
  updateOrder,
  getMyOrders,
  getAllOrders,
  updateOrderStatus,
  confirmOrder,
  cancelOrder,
};
