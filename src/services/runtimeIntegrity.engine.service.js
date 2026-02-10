const FlowNode = require("../models/FlowNode");

const LEGAL_REQUIRED_TYPES = [
  "email",
  "phone",
  "number",
  "text_input"
];

module.exports = async function runtimeIntegrityEngine(flow, { session } = {}) {

  if (!session) {
    throw new Error(
      "runtimeIntegrityEngine requiere session dentro de transacciones"
    );
  }

  if (!flow || !flow._id) {
    throw new Error("Flow inválido en runtimeIntegrityEngine");
  }

  const nodes = await FlowNode.find({
    flow_id: flow._id,
    account_id: flow.account_id
  })
    .session(session)
    .lean();

  if (!nodes.length) {
    throw new Error("Flow sin nodos");
  }

  /* ───────── MAPA DE NODOS ───────── */

  const nodeMap = new Map();
  nodes.forEach(n => {
    nodeMap.set(String(n._id), n);
  });

  const startId = String(flow.start_node_id);

  if (!nodeMap.has(startId)) {
    throw new Error("Start node inexistente");
  }

  /* ───────── BUILD GRAPH ───────── */

  const graph = {};

  nodes.forEach(node => {
    const id = String(node._id);
    graph[id] = [];

    if (node.next_node_id) {
      graph[id].push(String(node.next_node_id));
    }

    if (Array.isArray(node.options)) {
      node.options.forEach(opt => {
        if (opt.next_node_id) {
          graph[id].push(String(opt.next_node_id));
        }
      });
    }
  });

  /* ───────── REACHABILITY ───────── */

  const reachable = new Set();

  function dfsReach(id) {
    if (reachable.has(id)) return;
    reachable.add(id);
    (graph[id] || []).forEach(dfsReach);
  }

  dfsReach(startId);

  nodes.forEach(n => {
    const id = String(n._id);
    if (!reachable.has(id)) {
      throw new Error(
        `Nodo huérfano detectado ${id} — no alcanzable desde start`
      );
    }
  });

  /* ───────── DEAD END + TERMINALES ───────── */

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

  /* ───────── LOOP DETECTION (DESDE START) ───────── */

  const visited = new Set();
  const stack = new Set();

  function detectLoop(id) {

    if (stack.has(id)) {
      const node = nodeMap.get(id);
      if (!node?.meta?.allow_loop) {
        throw new Error(`Loop infinito detectado en nodo ${id}`);
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

  /* ───────── LEGAL CONSENT (PATH REAL) ───────── */

  function hasConsentBefore(targetId) {
    const visited = new Set();

    function dfs(id) {
      if (visited.has(id)) return false;
      visited.add(id);

      const node = nodeMap.get(id);
      if (!node) return false;

      if (node.node_type === "data_policy") return true;
      if (node.end_conversation) return false;

      return (graph[id] || []).some(next => {
        if (next === targetId) return true;
        return dfs(next);
      });
    }

    return dfs(startId);
  }

  nodes.forEach(node => {
    if (!LEGAL_REQUIRED_TYPES.includes(node.node_type)) return;

    if (!hasConsentBefore(String(node._id))) {
      throw new Error(
        `Nodo ${node._id} captura datos sin consentimiento previo`
      );
    }
  });

  /* ───────── MULTI ENTRY DETECTION ───────── */

  const incoming = {};
  Object.keys(graph).forEach(id => incoming[id] = 0);

  Object.values(graph).forEach(list => {
    list.forEach(id => {
      incoming[id]++;
    });
  });

  Object.keys(incoming).forEach(id => {
    if (incoming[id] === 0 && id !== startId) {
      throw new Error(`Nodo con entrada ilegal ${id}`);
    }
  });

  /* ───────── VALIDACIONES EXTRA (OPCIONALES) ───────── */

  const vars = new Set();

  nodes.forEach(node => {
    if (node.variable_key) {
      if (vars.has(node.variable_key)) {
        throw new Error(`variable_key duplicado: ${node.variable_key}`);
      }
      vars.add(node.variable_key);
    }

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