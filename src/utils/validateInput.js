// utils/validateInput.js
module.exports = function validateInput(value, rules = []) {
  for (const rule of rules) {
    switch (rule.type) {
      case "email":
        if (!/^\S+@\S+\.\S+$/.test(value)) {
          return { ok: false, message: rule.message };
        }
        break;

      case "phone":
        if (!/^[0-9+\-\s]{6,20}$/.test(value)) {
          return { ok: false, message: rule.message };
        }
        break;

      case "min_max":
        const length = value.length;
        if (length < rule.min || length > rule.max) {
          return { ok: false, message: rule.message };
        }
        break;

      case "integer":
        if (!Number.isInteger(Number(value))) {
          return { ok: false, message: rule.message };
        }
        break;
    }
  }

  return { ok: true };
};
