const jwt = require("jsonwebtoken");
const User = require("../models/user.model");
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
    const user = await User.findById(req.user._id).populate(
      "address.region address.district address.neighborhood address.street",
      "name type",
    );
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

module.exports = { register, login, adminLogin, getMe };
