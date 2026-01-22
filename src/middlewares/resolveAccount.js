const Account = require("../models/Account");

exports.resolveAccount = async (req, res, next) => {
  try {
    // 1️⃣ Obtener subdominio o slug
    const host = req.headers.host; 
    // ej: empresa-demo-a2552d.midominio.com

    if (!host) {
      return res.status(400).json({
        message: "No se pudo resolver la cuenta"
      });
    }

    const slug = host.split(".")[0];

    // 2️⃣ Buscar cuenta
    const account = await Account.findOne({ slug });

    if (!account) {
      return res.status(404).json({
        message: "Cuenta no encontrada"
      });
    }

    // 3️⃣ Adjuntar cuenta al request
    req.account = account;
    req.account_id = account._id;

    next();
  } catch (error) {
    console.error("RESOLVE ACCOUNT ERROR:", error);
    res.status(500).json({
      message: "Error al resolver la cuenta"
    });
  }
};
