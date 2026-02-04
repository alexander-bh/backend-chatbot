const Account = require("../models/Account");

exports.resolveAccount = async (req, res, next) => {
  try {
    const slug = (
      req.headers["x-account-slug"] ||
      req.body?.account_slug ||
      req.query?.account_slug
    )?.toString().trim().toLowerCase();

    // account_slug obligatorio
    if (!slug) {
      return res.status(400).json({ message: "account_slug requerido" });
    }

    const account = await Account.findOne({ slug });

    if (!account) {
      return res.status(404).json({ message: "Cuenta no encontrada" });
    }

    if (account.status !== "active") {
      return res.status(403).json({ message: "Cuenta suspendida" });
    }

    req.account = account;
    req.account_id = account._id;

    next();
  } catch (error) {
    console.error("RESOLVE ACCOUNT ERROR:", error);
    res.status(500).json({ message: "Error al resolver la cuenta" });
  }
};
