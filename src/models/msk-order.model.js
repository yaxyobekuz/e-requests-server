const mongoose = require("mongoose");

const mskOrderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MskCategory",
      required: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    contactFirstName: {
      type: String,
      required: true,
      trim: true,
    },
    contactLastName: {
      type: String,
      required: true,
      trim: true,
    },
    contactPhone: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      region: { type: mongoose.Schema.Types.ObjectId, ref: "Region" },
      district: { type: mongoose.Schema.Types.ObjectId, ref: "Region" },
      neighborhood: { type: mongoose.Schema.Types.ObjectId, ref: "Region" },
      street: { type: mongoose.Schema.Types.ObjectId, ref: "Region" },
      neighborhoodCustom: { type: String, default: "" },
      streetCustom: { type: String, default: "" },
      houseNumber: { type: String, default: "" },
      apartment: { type: String, default: "" },
    },
    status: {
      type: String,
      enum: ["pending", "in_review", "pending_confirmation", "confirmed", "rejected", "cancelled"],
      default: "pending",
    },
    rejectionReason: {
      type: String,
      default: "",
    },
    cancelReason: {
      type: String,
      default: "",
    },
    assignedAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    confirmedByUser: {
      type: Boolean,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

mskOrderSchema.index({ user: 1, status: 1 });
mskOrderSchema.index({ status: 1, "address.region": 1 });

module.exports = mongoose.model("MskOrder", mskOrderSchema);
