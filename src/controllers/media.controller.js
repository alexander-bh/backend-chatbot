const { deleteFromCloudinary } = require("../services/cloudinary.service");

exports.replaceMedia = async (req, res) => {
  try {
    const { old_public_id } = req.body;

    const newFile = req.file;

    if (!newFile) {
      return res.status(400).json({
        success: false,
        message: "Archivo requerido"
      });
    }

    // borrar anterior
    if (old_public_id) {
      try {
        await deleteFromCloudinary(old_public_id);
      } catch (err) {
        console.log("Error borrando anterior:", err.message);
      }
    }

    return res.json({
      success: true,
      url: newFile.path,
      public_id: newFile.filename,
      type: newFile.mimetype.startsWith("video/") ? "video" : "image"
    });

  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Error reemplazando media"
    });
  }
};

