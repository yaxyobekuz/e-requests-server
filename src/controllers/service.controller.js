const mongoose = require("mongoose");
const Service = require("../models/service.model");
const ServiceReport = require("../models/service-report.model");

// ============ SERVICES ============

/** GET /api/services */
const getAll = async (req, res) => {
  try {
    const services = await Service.find({ isActive: true }).sort({ name: 1 });
    res.json(services);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** POST /api/services */
const create = async (req, res) => {
  try {
    const { name, icon } = req.body;
    if (!name) {
      return res.status(400).json({ message: "Servis nomi kiritilishi shart" });
    }

    const existing = await Service.findOne({ name });
    if (existing) {
      return res.status(400).json({ message: "Bunday servis allaqachon mavjud" });
    }

    const service = await Service.create({ name, icon: icon || "" });
    res.status(201).json(service);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** PUT /api/services/:id */
const update = async (req, res) => {
  try {
    const { name, icon, isActive } = req.body;
    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ message: "Servis topilmadi" });
    }

    if (name !== undefined) service.name = name;
    if (icon !== undefined) service.icon = icon;
    if (isActive !== undefined) service.isActive = isActive;

    await service.save();
    res.json(service);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** DELETE /api/services/:id */
const remove = async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ message: "Servis topilmadi" });
    }

    await service.deleteOne();
    res.json({ message: "Servis o'chirildi" });
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

// ============ SERVICE REPORTS ============

/** POST /api/service-reports */
const createReport = async (req, res) => {
  try {
    const { serviceId } = req.body;
    const user = req.user;

    if (!user.address) {
      return res.status(400).json({ message: "Avval hududingizni belgilang" });
    }

    const report = await ServiceReport.create({
      service: serviceId,
      user: user._id,
      address: {
        region: user.address.region,
        district: user.address.district,
        neighborhood: user.address.neighborhood,
        street: user.address.street,
        neighborhoodCustom: user.address.neighborhoodCustom,
        streetCustom: user.address.streetCustom,
      },
      status: "unavailable",
    });

    const populated = await ServiceReport.findById(report._id)
      .populate("service", "name icon")
      .populate("user", "firstName phone");

    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** GET /api/service-reports/my */
const getMyReports = async (req, res) => {
  try {
    const reports = await ServiceReport.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .populate("service", "name icon")
      .populate("address.region address.district address.neighborhood address.street", "name");

    res.json(reports);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** GET /api/service-reports */
const getAllReports = async (req, res) => {
  try {
    const { serviceId, regionId, status, page = 1, limit = 20 } = req.query;
    const filter = {};

    if (serviceId) filter.service = serviceId;
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

    // Permission: ruxsat berilgan servis turlari bo'yicha filtrlash
    if (req.allowedServiceTypes && req.allowedServiceTypes.length > 0) {
      filter.service = { $in: req.allowedServiceTypes };
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [reports, total] = await Promise.all([
      ServiceReport.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("service", "name icon")
        .populate("user", "firstName phone")
        .populate("address.region address.district address.neighborhood address.street", "name")
        .populate("resolvedByAdmin", "firstName alias"),
      ServiceReport.countDocuments(filter),
    ]);

    res.json({ data: reports, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** PUT /api/service-reports/:id/status (admin) */
const updateReportStatus = async (req, res) => {
  try {
    const { status, rejectionReason, adminNote } = req.body;
    const report = await ServiceReport.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ message: "Hisobot topilmadi" });
    }

    const currentStatus = report.status;

    // Validatsiya: ruxsat etilgan o'tishlar
    const allowedTransitions = {
      unavailable: ["in_progress", "pending_confirmation", "rejected"],
      in_progress: ["pending_confirmation", "rejected"],
    };

    const allowed = allowedTransitions[currentStatus];
    if (!allowed || !allowed.includes(status)) {
      return res.status(400).json({
        message: `"${currentStatus}" statusidan "${status}" statusiga o'tish mumkin emas`,
      });
    }

    // Rad etish uchun sabab majburiy
    if (status === "rejected") {
      if (!rejectionReason || !rejectionReason.trim()) {
        return res.status(400).json({ message: "Rad etish sababi kiritilishi shart" });
      }
      report.rejectionReason = rejectionReason.trim();
    }

    if (adminNote) {
      report.adminNote = adminNote.trim();
    }

    report.status = status;
    report.resolvedByAdmin = req.user._id;
    await report.save();

    const populated = await ServiceReport.findById(report._id)
      .populate("service", "name icon")
      .populate("user", "firstName phone")
      .populate("resolvedByAdmin", "firstName alias")
      .populate("address.region address.district address.neighborhood address.street", "name");

    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** PUT /api/service-reports/:id/confirm */
const confirmReport = async (req, res) => {
  try {
    const { confirmed } = req.body;
    const report = await ServiceReport.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!report) {
      return res.status(404).json({ message: "Hisobot topilmadi" });
    }

    if (report.status !== "pending_confirmation") {
      return res.status(400).json({
        message: "Faqat 'Tasdiq kutilmoqda' statusidagi hisobotlarni tasdiqlash mumkin",
      });
    }

    report.confirmedByUser = confirmed;
    report.status = confirmed ? "confirmed" : "unavailable";
    await report.save();

    const populated = await ServiceReport.findById(report._id)
      .populate("service", "name icon")
      .populate("address.region address.district address.neighborhood address.street", "name");

    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** PUT /api/service-reports/:id/cancel (user) */
const cancelReport = async (req, res) => {
  try {
    const { cancelReason } = req.body;
    const report = await ServiceReport.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!report) {
      return res.status(404).json({ message: "Hisobot topilmadi" });
    }

    if (["confirmed", "rejected", "cancelled"].includes(report.status)) {
      return res.status(400).json({ message: "Bu hisobotni bekor qilib bo'lmaydi" });
    }

    report.status = "cancelled";
    if (cancelReason) report.cancelReason = cancelReason.trim();
    await report.save();

    const populated = await ServiceReport.findById(report._id)
      .populate("service", "name icon")
      .populate("address.region address.district address.neighborhood address.street", "name");

    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** GET /api/service-reports/stats */
const getServiceStats = async (req, res) => {
  try {
    const { regionId, districtId, neighborhoodId, serviceId } = req.query;
    const matchFilter = {};

    // Hudud filtrlash
    if (neighborhoodId) {
      matchFilter["address.neighborhood"] = new mongoose.Types.ObjectId(neighborhoodId);
    } else if (districtId) {
      matchFilter["address.district"] = new mongoose.Types.ObjectId(districtId);
    } else if (regionId) {
      matchFilter["address.region"] = new mongoose.Types.ObjectId(regionId);
    }

    // Admin uchun hudud cheklash
    if (req.user.role === "admin" && req.user.assignedRegion) {
      const rid = new mongoose.Types.ObjectId(req.user.assignedRegion.region.toString());
      if (!matchFilter["address.region"] && !matchFilter["address.district"] && !matchFilter["address.neighborhood"] && !matchFilter["address.street"]) {
        matchFilter["$or"] = [
          { "address.region": rid },
          { "address.district": rid },
          { "address.neighborhood": rid },
        ];
      }
    }

    // Permission: ruxsat berilgan servis turlari bo'yicha filtrlash
    if (req.allowedServiceTypes && req.allowedServiceTypes.length > 0) {
      matchFilter.service = { $in: req.allowedServiceTypes.map((id) => new mongoose.Types.ObjectId(id.toString())) };
    }

    if (serviceId) {
      matchFilter.service = new mongoose.Types.ObjectId(serviceId);
    }

    const pipeline = [
      ...(Object.keys(matchFilter).length > 0 ? [{ $match: matchFilter }] : []),
      {
        $group: {
          _id: { service: "$service", status: "$status" },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: "$_id.service",
          statuses: { $push: { status: "$_id.status", count: "$count" } },
          total: { $sum: "$count" },
        },
      },
      {
        $lookup: {
          from: "services",
          localField: "_id",
          foreignField: "_id",
          as: "service",
        },
      },
      { $unwind: "$service" },
      {
        $project: {
          _id: 1,
          serviceName: "$service.name",
          serviceIcon: "$service.icon",
          total: 1,
          statuses: 1,
        },
      },
      { $sort: { serviceName: 1 } },
    ];

    const stats = await ServiceReport.aggregate(pipeline);

    // Foiz hisoblash
    const result = stats.map((item) => {
      const statusMap = {};
      item.statuses.forEach((s) => {
        statusMap[s.status] = s.count;
      });

      const unavailable = statusMap.unavailable || 0;
      const inProgress = statusMap.in_progress || 0;
      const pendingConfirmation = statusMap.pending_confirmation || 0;
      const confirmed = statusMap.confirmed || 0;
      const rejected = statusMap.rejected || 0;
      const problemCount = unavailable + inProgress + pendingConfirmation;

      return {
        serviceId: item._id,
        serviceName: item.serviceName,
        serviceIcon: item.serviceIcon,
        total: item.total,
        unavailable,
        inProgress,
        pendingConfirmation,
        confirmed,
        rejected,
        problemCount,
        problemPercent: item.total > 0 ? Math.round((problemCount / item.total) * 100) : 0,
        availablePercent: item.total > 0 ? Math.round((confirmed / item.total) * 100) : 0,
      };
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

module.exports = {
  getAll,
  create,
  update,
  remove,
  createReport,
  getMyReports,
  getAllReports,
  updateReportStatus,
  confirmReport,
  cancelReport,
  getServiceStats,
};
