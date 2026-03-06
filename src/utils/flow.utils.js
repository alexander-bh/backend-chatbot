// utils/flow.utils.js Este archivo ya nos e usa
const Flow = require("../models/Flow");

exports.getEditableFlow = async (
  flow_id,
  {
    account_id = null,
    user_role = null
  } = {},
  session = null
) => {

  const q = Flow.findById(flow_id);

  if (session) {
    q.session(session);
  }

  const flow = await q;

  if (!flow) {
    throw new Error("Flow no encontrado");
  }

  /* ===============================
     TEMPLATE GLOBAL
  =============================== */

  if (flow.is_template === true) {

    if (user_role !== "ADMIN") {
      throw new Error("Solo ADMIN puede editar el diálogo global");
    }

    return flow;
  }

  /* ===============================
     ADMIN NO PUEDE EDITAR FLOWS
     DE CLIENTES
  =============================== */

  if (user_role === "ADMIN") {
    throw new Error("ADMIN no puede editar flows de clientes");
  }

  /* ===============================
     VALIDAR PROPIEDAD DEL FLOW
  =============================== */

  if (!flow.account_id || String(flow.account_id) !== String(account_id)) {
    throw new Error("Flow no autorizado");
  }

  return flow;
};