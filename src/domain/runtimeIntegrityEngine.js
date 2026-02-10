const FlowNode = require("../models/FlowNode");

const LEGAL_REQUIRED_TYPES = [
  "email",
  "phone",
  "number",
  "text_input"
];

module.exports = async function runtimeIntegrityEngine(flow, { session } = {}) {

  if (!session) {
    throw new Error("runtimeIntegrityEngine requiere session activa");
  }

  if (!flow || !flow._id) {
    throw new Error("Flow inválido");
  }

  /* ───────── LOAD NODES ───────── */

  const nodes = await FlowNode.find({
    flow_id: flow._id,
    account_id: flow.account_id
  })
    .session(session)
    .lean();

  if (!nodes.length) {
    throw new Error("Flow sin nodos");
  }

  /* ───────── MAP + GRAPH ───────── */

  const nodeMap = new Map();
  const graph = {};

  nodes.forEach(n => {
    const id = String(n._id);
    nodeMap.set(id, n);
    graph[id] = [];
  });

  nodes.forEach(node => {

    const id = String(node._id);

    if (node.next_node_id) {
      graph[id].push(String(node.next_node_id));
    }

    if (Array.isArray(node.options)) {

      node.options.forEach(opt => {

        if (!opt.next_node_id) {
          throw new Error(`Opción sin destino en nodo ${id}`);
        }

        graph[id].push(String(opt.next_node_id));
      });
    }
  });

  /* ───────── DESTINOS EXISTENTES ───────── */

  Object.values(graph).forEach(list => {
    list.forEach(id => {
      if (!nodeMap.has(id)) {
        throw new Error(`Destino inexistente ${id}`);
      }
    });
  });

  /* ───────── START NODE ───────── */

  const startId = String(flow.start_node_id);

  if (!nodeMap.has(startId)) {
    throw new Error("Start node inexistente");
  }

  /* ───────── REACHABILITY ───────── */

  const reachable = new Set();

  function dfsReach(id) {
    if (reachable.has(id)) return;
    reachable.add(id);
    (graph[id] || []).forEach(dfsReach);
  }

  dfsReach(startId);

  nodes.forEach(n => {
    if (!reachable.has(String(n._id))) {
      throw new Error(`Nodo huérfano ${n._id}`);
    }
  });

  /* ───────── TERMINALES ───────── */

  nodes.forEach(node => {

    const id = String(node._id);
    const exits = graph[id].length;

    if (node.end_conversation === true && exits > 0) {
      throw new Error(`Nodo terminal con salida ${id}`);
    }

    if (node.node_type === "link" && exits > 0) {
      throw new Error(`Nodo link no puede tener salida ${id}`);
    }

    const hasExit =
      exits > 0 ||
      node.end_conversation === true ||
      node.node_type === "link";

    if (!hasExit) {
      throw new Error(`Nodo sin salida ${id}`);
    }
  });

  /* ───────── LOOP DETECTION ───────── */

  const visited = new Set();
  const stack = new Set();

  function detectLoop(id) {

    if (stack.has(id)) {

      const node = nodeMap.get(id);

      if (!node?.meta?.allow_loop) {
        throw new Error(`Loop infinito detectado en ${id}`);
      }

      return;
    }

    if (visited.has(id)) return;

    visited.add(id);
    stack.add(id);

    (graph[id] || []).forEach(detectLoop);

    stack.delete(id);
  }

  detectLoop(startId);

  /* ───────── LEGAL CONSENT ENTERPRISE ───────── */

  function validateConsent(targetId) {

    const visited = new Set();

    function dfs(id, consentSeen) {

      const key = id + "|" + consentSeen;
      if (visited.has(key)) return true;
      visited.add(key);

      const node = nodeMap.get(id);
      if (!node) return true;

      if (node.node_type === "data_policy") {
        consentSeen = true;
      }

      if (id === targetId) {
        return consentSeen;
      }

      if (node.end_conversation) {
        return true;
      }

      return (graph[id] || []).every(next =>
        dfs(next, consentSeen)
      );
    }

    return dfs(startId, true); //<--- aqui para para evitar enviar sin politicas 
  }

  nodes.forEach(node => {

    if (!LEGAL_REQUIRED_TYPES.includes(node.node_type)) return;

    if (!validateConsent(String(node._id))) {
      throw new Error(
        `Nodo ${node._id} captura datos sin consentimiento previo`
      );
    }
  });

  /* ───────── ENTRADAS ───────── */

  const incoming = {};
  Object.keys(graph).forEach(id => incoming[id] = 0);

  Object.values(graph).forEach(list => {
    list.forEach(id => incoming[id]++);
  });

  Object.keys(incoming).forEach(id => {
    if (incoming[id] === 0 && id !== startId) {
      throw new Error(`Nodo sin entrada ${id}`);
    }
  });

  /* ───────── VARIABLES ───────── */

  const vars = new Set();

  nodes.forEach(node => {

    /*
    if (node.variable_key) {

      if (vars.has(node.variable_key)) {
        throw new Error(
          `variable_key duplicado ${node.variable_key}`
        );
      }

      vars.add(node.variable_key);
    }*/

    if (
      node.typing_time != null &&
      (node.typing_time < 0 || node.typing_time > 10)
    ) {
      throw new Error(`typing_time inválido en ${node._id}`);
    }
  });

  return {
    ok: true,
    nodes: nodes.length,
    reachable: reachable.size
  };
};



