const Product = require("../models/product.model");

/**
 * Barcha faol mahsulotlarni navlari bilan qaytaradi.
 * @route GET /api/products
 */
exports.getAll = async (req, res) => {
  try {
    const products = await Product.find({ isActive: true }).sort({ name: 1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * Yangi mahsulot yaratadi (faqat owner).
 * @route POST /api/products
 */
exports.create = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Mahsulot nomi kiritilishi shart" });
    }
    const product = await Product.create({ name: name.trim() });
    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * Mahsulotni yangilaydi (faqat owner).
 * @route PUT /api/products/:id
 */
exports.update = async (req, res) => {
  try {
    const { name, isActive } = req.body;
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Mahsulot topilmadi" });

    if (name !== undefined) product.name = name.trim();
    if (isActive !== undefined) product.isActive = isActive;
    await product.save();

    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * Mahsulotni o'chiradi (faqat owner).
 * @route DELETE /api/products/:id
 */
exports.remove = async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ message: "Mahsulot topilmadi" });
    res.json({ message: "Mahsulot o'chirildi" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * Mahsulotga yangi nav qo'shadi (faqat owner).
 * @route POST /api/products/:id/varieties
 */
exports.addVariety = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Nav nomi kiritilishi shart" });
    }
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Mahsulot topilmadi" });

    product.varieties.push({ name: name.trim() });
    await product.save();

    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * Mavjud navni yangilaydi (faqat owner).
 * @route PUT /api/products/:id/varieties/:varId
 */
exports.updateVariety = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Nav nomi kiritilishi shart" });
    }
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Mahsulot topilmadi" });

    const variety = product.varieties.id(req.params.varId);
    if (!variety) return res.status(404).json({ message: "Nav topilmadi" });

    variety.name = name.trim();
    await product.save();

    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * Navni o'chiradi (faqat owner).
 * @route DELETE /api/products/:id/varieties/:varId
 */
exports.removeVariety = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Mahsulot topilmadi" });

    const variety = product.varieties.id(req.params.varId);
    if (!variety) return res.status(404).json({ message: "Nav topilmadi" });

    variety.deleteOne();
    await product.save();

    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
