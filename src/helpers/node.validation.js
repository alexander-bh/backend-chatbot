const mongoose = require("mongoose");

const ALLOWED_NODE_TYPES = [
  "message",
  "question",
  "options",
  "input",
  "action"
];

exports.validateNodePayload = payload => {
  const {
    flow_id,
    node_type,
    content,
    options,
    typing_time,
    variable_key
  } = payload;

  if (flow_id && !mongoose.Types.ObjectId.isValid(flow_id)) {
    throw new Error("flow_id inválido");
  }

  if (!ALLOWED_NODE_TYPES.includes(node_type)) {
    throw new Error("node_type inválido");
  }

  // 🧠 Content requerido según tipo
  if (
    ["message", "question", "input"].includes(node_type) &&
    (!content || typeof content !== "string")
  ) {
    throw new Error("content requerido para este tipo de nodo");
  }

  // 🔘 Options
  if (node_type === "options") {
    if (!Array.isArray(options) || options.length === 0) {
      throw new Error("options requeridas");
    }

    options.forEach((opt, i) => {
      if (!opt.label || typeof opt.label !== "string") {
        throw new Error(`label inválido en option ${i}`);
      }

      if (opt.value === undefined) {
        throw new Error(`value requerido en option ${i}`);
      }
    });
  }

  // ⏱ typing_time
  if (
    typing_time !== undefined &&
    (typing_time < 0 || typing_time > 10)
  ) {
    throw new Error("typing_time fuera de rango (0–10)");
  }

  // 🧩 variable_key
  if (variable_key !== undefined) {
    if (typeof variable_key !== "string") {
      throw new Error("variable_key inválido");
    }

    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(variable_key)) {
      throw new Error("variable_key no es válida");
    }
  }
};
