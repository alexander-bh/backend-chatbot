module.exports = (err, req, res, next) => {
  if (!err) return next();

  if (err.message === "Solo se permiten imágenes") {
    return res.status(400).json({ message: err.message });
  }

  if (err.code === "LIMIT_FILE_SIZE") {
    return res
      .status(400)
      .json({ message: "La imagen no debe superar 2MB" });
  }

  next(err);
};
