const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");


const fileFilter = (req, file, cb) => {
  if (!file.mimetype.startsWith("image/")) {
    cb(new Error("Solo se permiten imágenes"), false);
  } else {
    cb(null, true);
  }
};

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "chatbots/avatars",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [
      { width: 256, height: 256, crop: "fill", gravity: "face" }
    ]
  }
});

const uploadAvatar = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB
  }
});

module.exports = uploadAvatar;

