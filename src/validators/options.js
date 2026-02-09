module.exports = payload => {
  const { options } = payload;

  if (!Array.isArray(options) || options.length === 0) {
    throw new Error("options requeridas");
  }

  options.forEach((opt, i) => {
    if (!opt.label || typeof opt.label !== "string") {
      throw new Error(`label inválido en option ${i}`);
    }

    if (
      opt.value === undefined ||
      !["string", "number"].includes(typeof opt.value)
    ) {
      throw new Error(`value inválido en option ${i}`);
    }
  });
};
