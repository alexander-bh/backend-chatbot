const SupportConfig = require("../models/Supportconfig");

const getSupportConfig = async () => {
    const config = await SupportConfig.findOne().lean();
    return {
        support_email: config?.support_email ?? process.env.ADMIN_SUPPORT_EMAIL ?? null,
        support_whatsapp: config?.support_whatsapp ?? process.env.SUPPORT_WHATSAPP ?? null,
    };
};

module.exports = getSupportConfig;