// Validar URL básica
exports.isValidUrl = (url) => {
  if (!url || typeof url !== "string") return false;

  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

// Detectar si puede ser media
exports.isMediaUrl = (url) => {
  if (!exports.isValidUrl(url)) return false;

  const cleanUrl = url.split("?")[0].toLowerCase();

  return (
    /\.(jpg|jpeg|png|gif|webp|bmp|svg|mp4|mov|webm|mkv|avi)$/i.test(cleanUrl) ||
    url.includes("cloudinary") ||
    url.includes("googleusercontent") ||
    url.includes("gstatic") ||
    url.includes("amazonaws") ||
    url.includes("firebase")
  );
};

// Detectar tipo de media
exports.getMediaType = (url) => {
  if (!url) return null;

  const cleanUrl = url.split("?")[0].toLowerCase();

  if (/\.(mp4|mov|webm|mkv|avi)$/i.test(cleanUrl)) {
    return "video";
  }

  if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(cleanUrl)) {
    return "image";
  }

  // fallback para CDN sin extensión
  return "image";
};

// Detectar YouTube
exports.isYoutubeUrl = (url) => {
  if (!url) return false;

  return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/i.test(url);
};

// Limpiar URL (remover espacios y cosas raras)
exports.cleanUrl = (url) => {
  if (!url) return url;
  return url.trim();
};