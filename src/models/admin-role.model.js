const mongoose = require("mongoose");

const adminRoleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    executionPermissions: {
      requests: { type: Boolean, default: false },
      services: { type: Boolean, default: false },
      msk: { type: Boolean, default: false },
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

module.exports = mongoose.model("AdminRole", adminRoleSchema);
