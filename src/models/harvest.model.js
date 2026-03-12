const mongoose = require("mongoose");

const harvestSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    varietyId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    varietyName: {
      type: String,
      required: true,
      trim: true,
    },
    area: {
      type: Number,
      required: true,
      min: 0.01,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    year: {
      type: Number,
      required: true,
    },
    season: {
      type: String,
      enum: ["bahor", "yoz", "kuz", "qish"],
      default: null,
    },
    address: {
      region: { type: mongoose.Schema.Types.ObjectId, ref: "Region" },
      district: { type: mongoose.Schema.Types.ObjectId, ref: "Region" },
      neighborhood: { type: mongoose.Schema.Types.ObjectId, ref: "Region" },
      street: { type: mongoose.Schema.Types.ObjectId, ref: "Region" },
    },
  },
  {
    timestamps: true,
  }
);

harvestSchema.index({ user: 1, createdAt: -1 });
harvestSchema.index({ product: 1, varietyId: 1, "address.region": 1 });

module.exports = mongoose.model("Harvest", harvestSchema);
