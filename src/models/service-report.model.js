const mongoose = require("mongoose");

const serviceReportSchema = new mongoose.Schema(
  {
    service: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    address: {
      region: { type: mongoose.Schema.Types.ObjectId, ref: "Region" },
      district: { type: mongoose.Schema.Types.ObjectId, ref: "Region" },
      neighborhood: { type: mongoose.Schema.Types.ObjectId, ref: "Region" },
      street: { type: mongoose.Schema.Types.ObjectId, ref: "Region" },
      neighborhoodCustom: { type: String, default: "" },
      streetCustom: { type: String, default: "" },
    },
    status: {
      type: String,
      enum: [
        "unavailable",
        "in_progress",
        "pending_confirmation",
        "confirmed",
        "rejected",
        "cancelled",
      ],
      default: "unavailable",
    },
    resolvedByAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    confirmedByUser: {
      type: Boolean,
      default: null,
    },
    rejectionReason: {
      type: String,
      default: "",
    },
    cancelReason: {
      type: String,
      default: "",
    },
    adminNote: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

serviceReportSchema.index({ service: 1, "address.region": 1, status: 1 });
serviceReportSchema.index({ service: 1, "address.district": 1, status: 1 });
serviceReportSchema.index({ service: 1, "address.neighborhood": 1, status: 1 });
serviceReportSchema.index({ user: 1, status: 1 });

module.exports = mongoose.model("ServiceReport", serviceReportSchema);
