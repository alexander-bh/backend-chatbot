module.exports = function validateNodeInput(node, input) {

  const errors = [];

  if (input === undefined || input === null || input === "") {
    errors.push("Este campo es obligatorio");
    return errors;
  }

  const value = String(input).trim();

  switch (node.node_type) {

    case "email":
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        errors.push("Ingresa un email válido");
      }
      break;

    case "phone":
      if (!/^[0-9+\-\s]{7,15}$/.test(value)) {
        errors.push("Ingresa un teléfono válido");
      }
      break;

    case "number":
      if (isNaN(value)) {
        errors.push("Debe ser un número válido");
      }
      break;

    case "options":
      if (isNaN(value) && !node.options?.some(o =>
        String(o.label).toLowerCase() === value.toLowerCase()
      )) {
        errors.push("Selecciona una opción válida");
      }
      break;
  }

  return errors;
};
