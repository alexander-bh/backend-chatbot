const FlowNode = require("../models/FlowNode");
const Flow = require("../models/Flow");

exports.validateFlowGraph = async ({
  flow_id,
  account_id,
  session,
  strict = false
}) => {

  const flow = await Flow.findOne(
    { _id: flow_id, account_id },
    null,
    { session }
  );

  if (!flow) return;

  const nodes = await FlowNode.find(
    { flow_id, account_id },
    null,
    { session }
  );

  if (!nodes.length) return;

  /* ─────────────────────────────────────
     SOLO nodos activos (no draft)
  ───────────────────────────────────── */
  const activeNodes = nodes.filter(n => !n.is_draft);

  if (!activeNodes.length) return;

  /* ─────────────────────────────────────
     Mapas base
  ───────────────────────────────────── */
  const nodeMap = new Map();
  const incomingCount = new Map();

  activeNodes.forEach(node => {
    const id = String(node._id);
    nodeMap.set(id, node);
    incomingCount.set(id, 0);
  });

  /* ─────────────────────────────────────
     Validar referencias + contar entradas
  ───────────────────────────────────── */
  const checkRef = (fromId, toId) => {

    if (!toId) return;

    const key = String(toId);

    if (!nodeMap.has(key)) {
      throw new Error("Nodo apunta a destino inexistente");
    }

    incomingCount.set(key, incomingCount.get(key) + 1);
  };

  for (const node of activeNodes) {

    if (node.next_node_id) {
      checkRef(node._id, node.next_node_id);
    }

    node.options?.forEach(opt => {
      if (opt.next_node_id) {
        checkRef(node._id, opt.next_node_id);
      }
    });
  }

  /* ─────────────────────────────────────
     Detectar nodo raíz real
  ───────────────────────────────────── */
  const roots = [...incomingCount.entries()]
    .filter(([_, count]) => count === 0)
    .map(([id]) => id);

  if (roots.length === 0) {
    throw new Error("El flujo no tiene nodo de inicio");
  }

  if (roots.length > 1) {
    throw new Error("El flujo tiene múltiples nodos de inicio");
  }

  const startNodeId = roots[0];

  /* ─────────────────────────────────────
     Validar start_node_id persistido
  ───────────────────────────────────── */
  if (flow.start_node_id) {
    if (String(flow.start_node_id) !== startNodeId) {
      throw new Error(
        "El start_node_id no coincide con el inicio real del flujo"
      );
    }
  }

  /* ─────────────────────────────────────
     DFS: ciclos + alcanzabilidad
  ───────────────────────────────────── */
  const visited = new Set();
  const stack = new Set();

  const dfs = (id) => {

    if (stack.has(id)) {
      throw new Error("El flujo contiene un ciclo");
    }

    if (visited.has(id)) return;

    visited.add(id);
    stack.add(id);

    const node = nodeMap.get(id);

    if (node.next_node_id) {
      dfs(String(node.next_node_id));
    }

    node.options?.forEach(opt => {
      if (opt.next_node_id) {
        dfs(String(opt.next_node_id));
      }
    });

    stack.delete(id);
  };

  dfs(startNodeId);

  if (visited.size !== activeNodes.length) {
    throw new Error("El flujo contiene nodos inalcanzables");
  }

  /* ─────────────────────────────────────
     Reglas de ejecución SOLO en strict
  ───────────────────────────────────── */
  if (strict) {

    for (const node of activeNodes) {

      const hasOutput =
        !!node.next_node_id ||
        node.options?.some(o => o.next_node_id);

      if (node.end_conversation) {

        if (hasOutput) {
          throw new Error("Un nodo end no puede tener salidas");
        }

      } else {

        if (!hasOutput) {
          throw new Error(
            "Un nodo sin end debe tener al menos una salida"
          );
        }

      }
    }
  }
};
