const Account = require("../models/Account");

module.exports = async function resolveAccount(req, res, next) {
  try {
    const slug = req.get("x-account-slug");

    if (!slug) {
      return res.status(400).json({
        message: "X-Account-Slug requerido"
      });
    }

    const account = await Account.findOne({
      slug,
      status: "active"
    });

    if (!account) {
      return res.status(404).json({
        message: "Cuenta no encontrada"
      });
    }

    req.account = account;
    next();

  } catch (error) {
    console.error("RESOLVE ACCOUNT ERROR:", error);
    return res.status(500).json({
      message: "Error al resolver cuenta"
    });
  }
};

