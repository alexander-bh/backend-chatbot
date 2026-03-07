const isValidUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

exports.isMediaUrl = (url) => {
  return /\.(jpg|jpeg|png|gif|webp|mp4|mov|webm)$/i.test(url);
};

exports.getMediaType = (url) => {
  return /\.(mp4|mov|webm)$/i.test(url) ? "video" : "image";
};

const isYoutubeUrl = (url) => {
  return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/i.test(url);
};