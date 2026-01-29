const upload = require("./uploadAvatar.middleware");

module.exports = function conditionalUpload(req, res, next) {
  const contentType = req.headers["content-type"] || "";

  // Solo ejecutar multer si es multipart
  if (contentType.includes("multipart/form-data")) {
    return upload.single("avatar")(req, res, next);
  }

  // Si no es multipart, seguimos normal
  next();
};
