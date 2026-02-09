module.exports = payload => {
  const { content, options, policy } = payload;

  if (!content) {
    throw new Error("content requerido para data_policy");
  }

  if (!Array.isArray(options) || options.length === 0) {
    throw new Error("options requeridas para data_policy");
  }

  if (policy) {
    if (
      policy.accept_label &&
      typeof policy.accept_label !== "string"
    ) {
      throw new Error("accept_label inválido");
    }

    if (
      policy.reject_label &&
      typeof policy.reject_label !== "string"
    ) {
      throw new Error("reject_label inválido");
    }
  }
};
