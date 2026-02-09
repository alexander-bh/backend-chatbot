module.exports = payload => {
  if (!payload.content || typeof payload.content !== "string") {
    throw new Error("content requerido para nodo text");
  }
};
