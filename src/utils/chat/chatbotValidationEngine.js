const validators = {

  required(value) {
    return value && String(value).trim().length > 0;
  },

  email(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  },

  phone(value) {
    return /^\d{10}$/.test(value);
  },

  number(value) {
    return /^-?\d+(\.\d+)?$/.test(value);
  },

  numericOnly(value) {
    return /^\d+$/.test(value);
  },

  url(value) {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  },

  minLength(value, rule) {
    return String(value).length >= rule.value;
  },

  maxLength(value, rule) {
    return String(value).length <= rule.value;
  },

  regex(value, rule) {
    const re = new RegExp(rule.value);
    return re.test(value);
  }

};

function getDefaultRules(node) {

  switch (node.node_type) {

    case "email":
      return [{
        type: "email",
        message: "Ingresa un email válido"
      }];

    case "phone":
      return [{
        type: "phone",
        message: "Ingresa un teléfono válido (10 dígitos)"
      }];

    case "number":
      return [{
        type: "number",
        message: "Ingresa un número válido"
      }];

    case "link":
      return [{
        type: "url",
        message: "Ingresa un enlace válido"
      }];

    default:
      return [];
  }
}

module.exports = function validateNodeInput(node, input) {

  const errors = [];

  let rules = [];

  if (node.validation?.enabled && node.validation.rules?.length) {
    rules = node.validation.rules;
  } else {
    rules = getDefaultRules(node);
  }

  for (const rule of rules) {

    const validator = validators[rule.type];

    if (!validator) continue;

    const valid = validator(input, rule);

    if (!valid) {
      errors.push(rule.message || "Entrada inválida");
    }

  }

  return errors;
};
