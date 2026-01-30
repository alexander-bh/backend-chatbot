const FlowNode = require("../models/FlowNode");

const INPUT_NODES = ["question", "email", "phone", "number"];
const ALLOWED_NODE_TYPES = [
  "text",
  "question",
  "email",
  "phone",
  "number",
  "options",
  "link"
];

// a-z, no números al inicio
const VARIABLE_KEY_REGEX = /^[a-z][a-z0-9_]*$/;

exports.validateCreateNode = async ({
  flow_id,
  node_type,
  content,
  variable_key,
  options = [],
  typing_time,
  link_action,
  account_id
}) => {
  if (!flow_id || !node_type) {
    throw new Error("flow_id y node_type requeridos");
  }

  if (!ALLOWED_NODE_TYPES.includes(node_type)) {
    throw new Error("node_type no permitido");
  }

  // ⏱ typing_time
  if (
    typing_time !== undefined &&
    (typing_time < 0 || typing_time > 10)
  ) {
    throw new Error("typing_time inválido (0–10)");
  }

  // 📝 Text
  if (node_type === "text" && !content) {
    throw new Error("content requerido para nodos text");
  }

  // ⌨ Inputs
  if (INPUT_NODES.includes(node_type)) {
    if (!content || !variable_key) {
      throw new Error("content y variable_key requeridos");
    }

    if (!VARIABLE_KEY_REGEX.test(variable_key)) {
      throw new Error("variable_key inválido");
    }

    const exists = await FlowNode.findOne({
      flow_id,
      variable_key,
      account_id
    });

    if (exists) {
      throw new Error("variable_key duplicado");
    }
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

  // 🔗 Link
  if (node_type === "link" && !link_action) {
    throw new Error("link_action requerido para nodos link");
  }
};
