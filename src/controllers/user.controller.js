const User = require("../models/user.model");
const Region = require("../models/region.model");

/** PUT /api/users/region */
const setRegion = async (req, res) => {
  try {
    const {
      region,
      district,
      neighborhood,
      street,
      neighborhoodCustom,
      streetCustom,
      houseType,
      houseNumber,
      apartment,
    } = req.body;

    if (!region || !district) {
      return res
        .status(400)
        .json({ message: "Viloyat va tuman kiritilishi shart" });
    }

    const address = {
      region,
      district,
      neighborhood: neighborhood || null,
      street: street || null,
      neighborhoodCustom: neighborhoodCustom || "",
      streetCustom: streetCustom || "",
      houseType: houseType || "private",
      houseNumber: houseNumber || "",
      apartment: apartment || "",
    };

    // Custom mahalla bo'lsa, yangi region yaratish
    if (!neighborhood && neighborhoodCustom) {
      const newNeighborhood = await Region.create({
        name: neighborhoodCustom,
        type: "neighborhood",
        parent: district,
      });
      address.neighborhood = newNeighborhood._id;
      address.neighborhoodCustom = "";
    }

    // Custom ko'cha bo'lsa, yangi region yaratish
    if (!street && streetCustom && address.neighborhood) {
      const newStreet = await Region.create({
        name: streetCustom,
        type: "street",
        parent: address.neighborhood,
      });
      address.street = newStreet._id;
      address.streetCustom = "";
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { address },
      { new: true },
    ).populate(
      "address.region address.district address.neighborhood address.street",
      "name type",
    );

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

/** GET /api/users/me */
const getProfile = async (req, res) => {
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

/** PUT /api/users/me */
const updateProfile = async (req, res) => {
  try {
    const { firstName, lastName } = req.body;
    const updates = {};

    if (firstName !== undefined) updates.firstName = firstName;
    if (lastName !== undefined) updates.lastName = lastName;

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
};

module.exports = { setRegion, getProfile, updateProfile };
