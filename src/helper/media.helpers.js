const { deleteFromCloudinary } = require("../services/cloudinary.service");

exports.deleteMediaBatch = async (publicIds = []) => {

  if (!publicIds?.length) return;

  await Promise.allSettled(
    publicIds.map(id => deleteFromCloudinary(id))
  );
};