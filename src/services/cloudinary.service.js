const cloudinary = require("../config/cloudinary")

exports.deleteFromCloudinary = async (publicId) => {
  return cloudinary.uploader.destroy(publicId);
};