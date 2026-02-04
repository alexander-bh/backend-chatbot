module.exports = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "No autenticado" });
    }

    if (!req.user.role) {
      return res.status(403).json({ message: "Rol no definido" });
    }

    const userRole = req.user.role.toUpperCase();
    const roles = allowedRoles.map(r => r.toUpperCase());

    if (!roles.includes(userRole)) {
      return res.status(403).json({
        message: "Acceso denegado"
      });
    }

    next();
  };
};
  