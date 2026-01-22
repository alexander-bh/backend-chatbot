exports.resolveAccount = async (req, res, next) => {
  try {
    const host = req.headers.host?.split(":")[0]; // quitar puerto
    const parts = host.split(".");

    if (parts.length < 2) {
      return res.status(400).json({ message: "Subdominio inválido" });
    }

    const subdomain = parts[0];

    if (["www", "api", "localhost"].includes(subdomain)) {
      return res.status(400).json({
        message: "Subdominio inválido"
      });
    }

    const account = await Account.findOne({ slug: subdomain });

    if (!account) {
      return res.status(404).json({
        message: "Cuenta no encontrada"
      });
    }

    req.account = account;
    next();
  } catch (error) {
    console.error("RESOLVE ACCOUNT ERROR:", error);
    res.status(500).json({ message: "Error al resolver cuenta" });
  }
};
