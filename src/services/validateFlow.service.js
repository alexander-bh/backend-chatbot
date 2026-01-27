const FlowNode = require("../models/FlowNode");

module.exports = async function validateFlow(flow) {
  const nodes = await FlowNode.find({
    flow_id: flow._id,
    is_draft: false
  });

  if (!nodes.length) {
    throw new Error("El flow no tiene nodos");
  }

  const nodeMap = new Map();
  nodes.forEach(n => nodeMap.set(n._id.toString(), n));

  /* ───────────── START NODE ───────────── */
  if (!flow.start_node_id) {
    throw new Error("El flow no tiene nodo inicial");
  }

  if (!nodeMap.has(flow.start_node_id.toString())) {
    throw new Error("El nodo inicial no existe o está en draft");
  }

  /* ───────────── PARENT RELATION ───────────── */
  nodes.forEach(node => {
    if (node.parent_node_id) {
      const parent = nodeMap.get(node.parent_node_id.toString());
      if (!parent) {
        throw new Error(`Nodo ${node._id} tiene parent inválido`);
      }
    }
  });

  /* ───────────── NODE VALIDATION ───────────── */
  for (const node of nodes) {
    const id = node._id.toString();

    /* OPTIONS */
    if (node.node_type === "options") {
      if (!node.options?.length) {
        throw new Error(`Nodo ${id} no tiene opciones`);
      }

      for (const opt of node.options) {
        if (!opt.next_node_id) {
          throw new Error(`Opción sin rama en nodo ${id}`);
        }

        const child = nodeMap.get(opt.next_node_id.toString());
        if (!child) {
          throw new Error(`Rama inválida en nodo ${id}`);
        }

        if (
          child.parent_node_id?.toString() !== id
        ) {
          throw new Error(
            `Nodo ${child._id} no apunta correctamente a su padre`
          );
        }
      }
    }

    /* INPUT */
    if (["question", "email", "phone", "number"].includes(node.node_type)) {
      if (!node.next_node_id) {
        throw new Error(`Nodo ${id} requiere next_node_id`);
      }
      if (!nodeMap.has(node.next_node_id.toString())) {
        throw new Error(`next_node_id inválido en nodo ${id}`);
      }
    }

    /* TEXT / JUMP */
    if (["text", "jump"].includes(node.node_type)) {
      if (node.next_node_id && !nodeMap.has(node.next_node_id.toString())) {
        throw new Error(`next_node_id inválido en nodo ${id}`);
      }
    }

    /* LINK */
    if (node.node_type === "link" && node.next_node_id) {
      throw new Error(`Nodo link ${id} no debe tener next_node_id`);
    }
  }

  /* ───────────── REACHABILITY (DFS) ───────────── */
  const visited = new Set();

  function dfs(nodeId) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const node = nodeMap.get(nodeId);
    if (!node) return;

    if (node.node_type === "options") {
      node.options.forEach(opt =>
        dfs(opt.next_node_id.toString())
      );
    } else if (node.next_node_id) {
      dfs(node.next_node_id.toString());
    }
  }

  dfs(flow.start_node_id.toString());

  for (const node of nodes) {
    if (!visited.has(node._id.toString())) {
      throw new Error(
        `Nodo ${node._id} no es alcanzable desde el inicio`
      );
    }
  }

  return true;
};
