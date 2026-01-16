module.exports = (Model, param = "id", field = "account_id") => {
  return async (req, res, next) => {
    const resource = await Model.findOne({
      _id: req.params[param],
      [field]: req.user.account_id
    });

    if (!resource)
      return res.status(403).json({ message: "Acceso denegado" });

    req.resource = resource;
    next();
  };
};