const SupportConfig = require("../models/Supportconfig");

/* ─────────────────────────────────────
   HELPER — obtiene (o crea) el único
   documento de configuración de soporte
───────────────────────────────────── */
const getOrCreateConfig = async () => {
  let config = await SupportConfig.findOne();
  if (!config) {
    config = await SupportConfig.create({
      support_email:    process.env.ADMIN_SUPPORT_EMAIL ?? null,
      support_whatsapp: process.env.SUPPORT_WHATSAPP    ?? null,
    });
  }
  return config;
};

module.exports = getOrCreateConfig;