const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

/* ─────────────── FILTRO ─────────────── */
const fileFilter = (req, file, cb) => {
  if (!file.mimetype.startsWith("image/")) {
    return cb(new Error("Solo se permiten imágenes"), false);
  }
  cb(null, true);
};

/* ─────────────── STORAGE ─────────────── */
const storage = new CloudinaryStorage({
  cloudinary,
  params: async () => ({
    folder: "chatbots/avatars",
    resource_type: "image",
    transformation: [
      {
        width: 256,
        height: 256,
        crop: "fill",
        gravity: "auto"
      }
    ]
  })
});

/* ─────────────── MULTER ─────────────── */
const uploadAvatar = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024
  }
});

module.exports = uploadAvatar;
