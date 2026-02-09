module.exports = payload => {
  if (!payload.next_node_id) {
    throw new Error("next_node_id requerido para jump");
  }
};
