module.exports = payload => {
  const { link_action } = payload;

  if (!link_action || !link_action.type || !link_action.value) {
    throw new Error("link_action inválido");
  }
};
