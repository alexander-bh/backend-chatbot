const mongoose = require("mongoose");
const { NODE_TYPES } = require("../shared/enum/nodeTypes");
const NODE_VALIDATORS = require("./nodeValidators");

exports.validateNodePayload = payload => {
  const { flow_id, node_type, typing_time, variable_key } = payload;

  //flow_id
  if (flow_id && !mongoose.Types.ObjectId.isValid(flow_id)) {
    throw new Error("flow_id inválido");
  }

  //node_type
  if (!node_type || !NODE_TYPES.includes(node_type)) {
    throw new Error("node_type inválido");
  }

  // ejecutar validador dinámico
  const validator = NODE_VALIDATORS[node_type];

  if (validator) {
    validator(payload);
  }

  // ⏱ typing_time
  if (
    typing_time !== undefined &&
    (typing_time < 0 || typing_time > 10)
  ) {
    throw new Error("typing_time fuera de rango (0–10)");
  }

  //variable_key
  if (variable_key !== undefined) {
    if (typeof variable_key !== "string") {
      throw new Error("variable_key inválido");
    }

    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(variable_key)) {
      throw new Error("variable_key no válida");
    }
  }
};
