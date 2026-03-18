const jwt = require("jsonwebtoken");
const User = require("../models/user.model");
const OtpCode = require("../models/otp-code.model");
const config = require("../config/env.config");

/**
 * Token yaratish
 * @param {string} id - Foydalanuvchi ID
 * @returns {string} JWT token
 */
const generateToken = (id) => {
  return jwt.sign({ id }, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN,
  });
};

/** POST /api/auth/register */
const register = async (req, res) => {
  try {
    const { firstName, phone, password } = req.body;

    if (!phone || !password) {
      return res
        .status(400)
        .json({ message: "Telefon raqam va parol kiritilishi shart" });
    }

    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "Bu telefon raqam allaqachon ro'yxatdan o'tgan" });
    }

    const user = await User.create({
      firstName: firstName || "",
      phone,
      password,
      role: "user",
    });

    const token = generateToken(user._id);

    res.status(201).json({ token, user });
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** POST /api/auth/login */
const login = async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res
        .status(400)
        .json({ message: "Telefon raqam va parol kiritilishi shart" });
    }

    const user = await User.findOne({ phone }).select("+password");
    if (!user || !user.isActive) {
      return res
        .status(401)
        .json({ message: "Telefon raqam yoki parol noto'g'ri" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ message: "Telefon raqam yoki parol noto'g'ri" });
    }

    const token = generateToken(user._id);

    res.json({ token, user });
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** POST /api/auth/admin/login */
const adminLogin = async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res
        .status(400)
        .json({ message: "Telefon raqam va parol kiritilishi shart" });
    }

    const user = await User.findOne({
      phone,
      role: { $in: ["admin", "owner"] },
    }).select("+password");

    if (!user || !user.isActive) {
      return res
        .status(401)
        .json({ message: "Telefon raqam yoki parol noto'g'ri" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ message: "Telefon raqam yoki parol noto'g'ri" });
    }

    const token = generateToken(user._id);

    res.json({ token, user });
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** GET /api/auth/me */
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate("address.region address.district address.neighborhood address.street", "name type")
      .populate("assignedRegion.region", "name type")
      .populate("adminRole", "name executionPermissions")
      .populate("permissions.requests.allowedTypes", "name")
      .populate("permissions.services.allowedTypes", "name icon")
      .populate("permissions.msk.allowedCategories", "name icon");
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** PUT /api/auth/me */
const updateMe = async (req, res) => {
  try {
    const { alias, firstName, lastName } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "Foydalanuvchi topilmadi" });
    }
    if (alias !== undefined) user.alias = alias;
    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    await user.save();
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** PUT /api/auth/change-password */
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Joriy va yangi parol kiritilishi shart" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: "Yangi parol kamida 6 ta belgidan iborat bo'lishi shart" });
    }
    const user = await User.findById(req.user._id).select("+password");
    if (!user) {
      return res.status(404).json({ message: "Foydalanuvchi topilmadi" });
    }
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: "Joriy parol noto'g'ri" });
    }
    user.password = newPassword;
    await user.save();
    res.json({ message: "Parol muvaffaqiyatli o'zgartirildi" });
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/**
 * OTP kodni tekshirish va o'chirish (bir martalik foydalanish)
 * @param {string} phone - Telefon raqam
 * @param {string} code - Foydalanuvchi kiritgan kod
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
const verifyOtp = async (phone, code) => {
  const otpRecord = await OtpCode.findOne({ phone });

  if (!otpRecord) {
    return { ok: false, error: "Kod topilmadi yoki muddati o'tgan" };
  }

  // Double-safety expiry check (30 minutes)
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  if (otpRecord.createdAt < thirtyMinutesAgo) {
    await OtpCode.deleteOne({ _id: otpRecord._id });
    return { ok: false, error: "Kod muddati o'tgan" };
  }

  if (otpRecord.code !== code) {
    return { ok: false, error: "Kod noto'g'ri" };
  }

  // One-time use: delete after successful verification
  await OtpCode.deleteOne({ _id: otpRecord._id });
  return { ok: true };
};

/** POST /api/auth/check-phone */
const checkPhone = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ message: "Telefon raqam kiritilishi shart" });
    }
    const user = await User.findOne({ phone });
    res.json({ exists: !!user });
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** POST /api/auth/login/otp */
const loginWithOtp = async (req, res) => {
  try {
    const { phone, code } = req.body;
    if (!phone || !code) {
      return res.status(400).json({ message: "Telefon raqam va kod kiritilishi shart" });
    }

    const result = await verifyOtp(phone, code);
    if (!result.ok) {
      return res.status(400).json({ message: result.error });
    }

    const user = await User.findOne({ phone });
    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Foydalanuvchi topilmadi yoki bloklangan" });
    }

    const token = generateToken(user._id);
    res.json({ token, user });
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** POST /api/auth/admin/login/otp */
const adminLoginWithOtp = async (req, res) => {
  try {
    const { phone, code } = req.body;
    if (!phone || !code) {
      return res.status(400).json({ message: "Telefon raqam va kod kiritilishi shart" });
    }

    const result = await verifyOtp(phone, code);
    if (!result.ok) {
      return res.status(400).json({ message: result.error });
    }

    const user = await User.findOne({ phone, role: { $in: ["admin", "owner"] } });
    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Telefon raqam yoki kod noto'g'ri" });
    }

    const token = generateToken(user._id);
    res.json({ token, user });
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** POST /api/auth/register/otp */
const registerWithOtp = async (req, res) => {
  try {
    const { phone, code, firstName, password } = req.body;
    if (!phone || !code || !firstName || !password) {
      return res.status(400).json({ message: "Barcha maydonlar to'ldirilishi shart" });
    }

    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(400).json({ message: "Bu telefon raqam allaqachon ro'yxatdan o'tgan" });
    }

    const result = await verifyOtp(phone, code);
    if (!result.ok) {
      return res.status(400).json({ message: result.error });
    }

    const user = await User.create({
      firstName: firstName.trim(),
      phone,
      password,
      role: "user",
    });

    const token = generateToken(user._id);
    res.status(201).json({ token, user });
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

module.exports = { register, login, adminLogin, getMe, updateMe, changePassword, checkPhone, loginWithOtp, adminLoginWithOtp, registerWithOtp };
