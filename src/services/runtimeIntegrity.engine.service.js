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

  const nodeMap = new Map();
  nodes.forEach(n =>
    nodeMap.set(String(n._id), n)
  );

  const startId = String(flow.start_node_id);

  if (!nodeMap.has(startId)) {
    console.error("START EN FLOW:", startId);
    console.error("NODOS EN BD:", [...nodeMap.keys()]);
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

  function dfs(id) {
    if (reachable.has(id)) return;
    reachable.add(id);
    (graph[id] || []).forEach(dfs);
  }

  dfs(startId);

  nodes.forEach(n => {
    const nid = String(n._id);
    if (!reachable.has(nid)) {
      throw new Error(
        `Nodo huérfano detectado ${nid} — NO está conectado al start`
      );
    }
  });

  /* ───────── DEAD END DETECTION ───────── */

  nodes.forEach(node => {
    const id = String(node._id);

    const hasExit =
      graph[id].length > 0 ||
      node.end_conversation === true ||
      node.node_type === "link" ||
      (node.node_type === "options" &&
        node.options?.some(o => o.next_node_id));

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
      if (!node.meta?.allow_loop) {
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

  nodes.forEach(n => {
    const id = String(n._id);
    if (!visited.has(id)) {
      detectLoop(id);
    }
  });

  /* ───────── LEGAL CONSENT PATH ───────── */

  nodes.forEach(node => {

    if (!LEGAL_REQUIRED_TYPES.includes(node.node_type))
      return;

    let current = node;
    let hasPolicy = false;

    while (current?.parent_node_id) {

      if (current.node_type === "data_policy") {
        hasPolicy = true;
        break;
      }

      const next = nodeMap.get(String(current.parent_node_id));
      if (!next) break;

      current = next;
    }

    if (!hasPolicy) {
      throw new Error(
        `Nodo ${node._id} captura datos sin consentimiento`
      );
    }
  });

  /* ───────── MULTI ENTRY DETECTION ───────── */

  const incoming = {};

  Object.keys(graph).forEach(k => {
    incoming[k] = 0;
  });

  Object.values(graph).forEach(list => {
    list.forEach(id => {
      incoming[id]++;
    });
  });

  Object.keys(incoming).forEach(id => {
    if (incoming[id] === 0 && id !== startId) {
      throw new Error(`Nodo entrada ilegal ${id}`);
    }
  });

  return {
    ok: true,
    nodes: nodes.length,
    reachable: reachable.size
  };
};
