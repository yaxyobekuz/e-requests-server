const mongoose = require("mongoose");

const regionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["region", "district", "neighborhood", "street"],
      required: true,
    },
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Region",
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

regionSchema.index({ type: 1, parent: 1 });
regionSchema.index({ name: 1, type: 1, parent: 1 }, { unique: true });

module.exports = mongoose.model("Region", regionSchema);
