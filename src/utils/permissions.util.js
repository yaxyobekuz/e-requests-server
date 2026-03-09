/**
 * Access darajasini raqamga aylantirish
 * @param {string} access - "off" | "read" | "manage"
 * @returns {number}
 */
const getAccessRank = (access) => {
  const ranks = { off: 0, read: 1, manage: 2 };
  return ranks[access] ?? 0;
};

/**
 * So'ralgan access darajasi yaratuvchining darajasidan oshmasligini tekshirish
 * @param {string} requested
 * @param {string} creatorAccess
 * @returns {boolean}
 */
const isAccessWithinBounds = (requested, creatorAccess) => {
  return getAccessRank(requested) <= getAccessRank(creatorAccess);
};

/**
 * So'ralgan ID ro'yxati yaratuvchining ro'yxatining quyi to'plami ekanligini tekshirish.
 * Agar yaratuvchida cheklov yo'q (bo'sh massiv) — so'ralgan har qanday ro'yxat ruxsat etiladi.
 * @param {string[]} requestedIds
 * @param {string[]} creatorIds
 * @returns {boolean}
 */
const isIdSetWithinBounds = (requestedIds, creatorIds) => {
  if (!creatorIds || creatorIds.length === 0) return true;
  const creatorSet = new Set(creatorIds.map((id) => id.toString()));
  return requestedIds.every((id) => creatorSet.has(id.toString()));
};

/**
 * So'ralgan permissionlar to'plami yaratuvchining permissionlaridan oshmasligini tekshirish
 * @param {object} requested - { requests, services, msk }
 * @param {object} creatorPerms - { requests, services, msk }
 * @returns {{ valid: boolean, message?: string }}
 */
const validatePermissionsSubset = (requested, creatorPerms) => {
  const modules = [
    {
      key: "requests",
      idsField: "allowedTypes",
      label: "Murojaatlar",
    },
    {
      key: "services",
      idsField: "allowedTypes",
      label: "Xizmat arizalari",
    },
    {
      key: "msk",
      idsField: "allowedCategories",
      label: "MSK buyurtmalar",
    },
  ];

  for (const mod of modules) {
    const req = requested?.[mod.key] || {};
    const creator = creatorPerms?.[mod.key] || {};

    if (!isAccessWithinBounds(req.access || "off", creator.access || "off")) {
      return {
        valid: false,
        message: `${mod.label} bo'yicha ruxsat darajasi sizning darajangizdan yuqori`,
      };
    }

    const reqIds = (req[mod.idsField] || []).map((id) => id.toString());
    const creatorIds = (creator[mod.idsField] || []).map((id) => id.toString());

    if (!isIdSetWithinBounds(reqIds, creatorIds)) {
      return {
        valid: false,
        message: `${mod.label} bo'yicha ruxsat berilgan turlar sizning ruxsatlaringizdan tashqariga chiqmoqda`,
      };
    }
  }

  return { valid: true };
};

module.exports = { getAccessRank, isAccessWithinBounds, isIdSetWithinBounds, validatePermissionsSubset };
