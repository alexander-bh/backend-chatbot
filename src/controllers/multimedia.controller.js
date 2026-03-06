exports.saveMediaNode = async (req, res) => {
  try {

    const {mediaUrl, type } = req.body;

    let url = mediaUrl;
    let publicId = null;

    if (req.file) {
      url = req.file.path;
      publicId = req.file.filename;
    }

    const media = {
      id: Date.now().toString(),
      type: type || "image",
      url,
      public_id: publicId,
    };

    res.json({
      success: true,
      media
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: error.message
    });

  }
};