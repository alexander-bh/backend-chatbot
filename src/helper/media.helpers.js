const { deleteFromCloudinary } = require("../services/cloudinary.service");

exports.deleteMediaBatch = async (publicIds = []) => {

  if (!publicIds.length) return;

  await Promise.all(
    publicIds.map(async id => {
      try {
        await deleteFromCloudinary(id);
      } catch (err) {
        console.error("Cloudinary delete error:", id, err.message);
      }
    })
  );
};