const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const assignedRegionSchema = new mongoose.Schema(
  {
    region: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Region",
      required: true,
    },
    regionType: {
      type: String,
      enum: ["region", "district", "neighborhood", "street"],
      required: true,
    },
  },
  { _id: false },
);

const addressSchema = new mongoose.Schema(
  {
    region: { type: mongoose.Schema.Types.ObjectId, ref: "Region" },
    district: { type: mongoose.Schema.Types.ObjectId, ref: "Region" },
    neighborhood: { type: mongoose.Schema.Types.ObjectId, ref: "Region" },
    street: { type: mongoose.Schema.Types.ObjectId, ref: "Region" },
    neighborhoodCustom: { type: String, default: "" },
    streetCustom: { type: String, default: "" },
    houseType: {
      type: String,
      enum: ["private", "apartment"],
      default: "private",
    },
    houseNumber: { type: String, default: "" },
    apartment: { type: String, default: "" },
  },
  { _id: false },
);

const permissionsSchema = new mongoose.Schema(
  {
    requests: {
      access: {
        type: String,
        enum: ["off", "read", "manage"],
        default: "manage",
      },
      allowedTypes: [{ type: mongoose.Schema.Types.ObjectId, ref: "RequestType" }],
    },
    services: {
      access: {
        type: String,
        enum: ["off", "read", "manage"],
        default: "manage",
      },
      allowedTypes: [{ type: mongoose.Schema.Types.ObjectId, ref: "Service" }],
    },
    msk: {
      access: {
        type: String,
        enum: ["off", "read", "manage"],
        default: "manage",
      },
      allowedCategories: [{ type: mongoose.Schema.Types.ObjectId, ref: "MskCategory" }],
    },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    firstName: {
      type: String,
      default: "",
    },
    lastName: {
      type: String,
      default: "",
    },
    role: {
      type: String,
      enum: ["owner", "admin", "user"],
      default: "user",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    address: {
      type: addressSchema,
      default: null,
    },
    alias: {
      type: String,
      default: "",
    },
    assignedRegion: {
      type: assignedRegionSchema,
      default: null,
    },
    permissions: {
      type: permissionsSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
  },
);

/**
 * @param {string} candidatePassword - Tekshiriladigan parol
 * @returns {Promise<boolean>}
 */
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.password;
    return ret;
  },
});

module.exports = mongoose.model("User", userSchema);
