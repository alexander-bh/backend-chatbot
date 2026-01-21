const FlowNode = require("../models/FlowNode");

const INPUT_NODES = ["question", "email", "phone", "number"];
const VARIABLE_KEY_REGEX = /^[a-z0-9_]+$/;

exports.validateCreateNode = async ({
  flow_id,
  node_type,
  content,
  variable_key
}) => {
  if (!flow_id || !node_type) {
    throw new Error("flow_id y node_type requeridos");
  }

  if (INPUT_NODES.includes(node_type)) {
    if (!content || !variable_key) {
      throw new Error("content y variable_key requeridos");
    }

    if (!VARIABLE_KEY_REGEX.test(variable_key)) {
      throw new Error("variable_key inválido");
    }

    const exists = await FlowNode.findOne({ flow_id, variable_key });
    if (exists) {
      throw new Error("variable_key duplicado");
    }
  }
};
