const Account = require("../models/Account");

exports.getMyAccount = async (req, res) => {
  try {
    const account = await Account.findById(req.user.account_id);

    if (!account) {
      return res.status(404).json({ message: "Cuenta no encontrada" });
    }

    res.json(account);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};