const { deleteFromCloudinary } = require("../services/cloudinary.service");

exports.deleteMedia = async (req, res) => {
  try {
    const { url, public_id } = req.body;

    if (!url && !public_id) {
      return res.status(400).json({
        success: false,
        message: "url o public_id requerido"
      });
    }

    let publicId = public_id;

    // Si solo mandan URL
    if (!publicId && url.includes("res.cloudinary.com")) {
      const parts = url.split("/");
      const file = parts[parts.length - 1];
      publicId = `chatbots/media/${file.split(".")[0]}`;
    }

    if (!publicId) {
      return res.json({
        success: true,
        message: "No es archivo de Cloudinary"
      });
    }

    await deleteFromCloudinary(publicId);

    return res.json({
      success: true,
      message: "Media eliminada"
    });

  } catch (error) {
    console.log("Delete media error:", error);
    return res.status(500).json({
      success: false,
      message: "Error eliminando media"
    });
  }
};

exports.deleteNodeMedia = async (req, res) => {
  try {

    const { node } = req.body;

    if (!node) {
      return res.status(400).json({
        success: false,
        message: "Nodo requerido"
      });
    }

    if (node.node_type !== "media") {
      return res.json({
        success: true,
        message: "El nodo no contiene media"
      });
    }

    const mediaList = node.media || [];

    const deleted = [];

    for (const media of mediaList) {

      if (!media.url) continue;

      // Solo borrar si es de Cloudinary
      if (!media.url.includes("res.cloudinary.com")) continue;

      let publicId = media.public_id;

      // Si no existe public_id lo reconstruimos
      if (!publicId) {
        const parts = media.url.split("/");
        const file = parts[parts.length - 1];
        publicId = `chatbots/media/${file.split(".")[0]}`;
      }

      try {
        await deleteFromCloudinary(publicId);
        deleted.push(publicId);
      } catch (err) {
        console.log("Error eliminando:", publicId, err.message);
      }

    }

    return res.json({
      success: true,
      deleted
    });

  } catch (error) {

    console.log("Delete node media error:", error);

    return res.status(500).json({
      success: false,
      message: "Error eliminando media del nodo"
    });
  }
};

exports.replaceMedia = async (req, res) => {
  try {
    const { old_public_id } = req.body;

    const newFile = req.file;

    console.log(old_public_id)

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

