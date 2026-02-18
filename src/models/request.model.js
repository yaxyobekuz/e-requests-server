const mongoose = require("mongoose");

const requestSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    category: {
      type: String,
      enum: ["infrastructure", "social", "finance"],
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
    status: {
      type: String,
      enum: ["pending", "in_review", "resolved", "rejected", "cancelled"],
      default: "pending",
    },
    rejectionReason: {
      type: String,
      default: "",
    },
    closingNote: {
      type: String,
      default: "",
    },
    cancelReason: {
      type: String,
      default: "",
    },
    type: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RequestType",
      default: null,
    },
    assignedAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
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
  },
  {
    timestamps: true,
  },
);

requestSchema.index({ user: 1, status: 1 });
requestSchema.index({ status: 1, "address.region": 1 });

module.exports = mongoose.model("Request", requestSchema);
