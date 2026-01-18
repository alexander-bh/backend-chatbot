const FlowNode = require("../models/FlowNode");
const Flow = require("../models/Flow");

exports.createNode = async (req, res) => {
  try {
    const {
      flow_id,
      node_type,
      content,
      options,
      next_node_id,
      position
    } = req.body;

    if (!flow_id || !node_type) {
      return res.status(400).json({ message: "Datos incompletos" });
    }

    const flow = await Flow.findById(flow_id);
    if (!flow) {
      return res.status(404).json({ message: "Flow no encontrado" });
    }

    const node = await FlowNode.create({
      flow_id,
      node_type,
      content,
      options,
      next_node_id,
      position
    });

    res.status(201).json(node);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al crear nodo" });
  }
};

exports.getNodesByFlow = async (req, res) => {
  const nodes = await FlowNode.find({
    flow_id: req.params.flowId
  });

  res.json(nodes);
};

exports.updateNode = async (req, res) => {
  const node = await FlowNode.findById(req.params.id);

  if (!node) {
    return res.status(404).json({ message: "Nodo no encontrado" });
  }

  Object.assign(node, req.body);
  await node.save();

  res.json(node);
};

exports.deleteNode = async (req, res) => {
  await FlowNode.findByIdAndDelete(req.params.id);
  res.json({ message: "Nodo eliminado" });
};

exports.connectNode = async (req, res) => {
  try {
    const node = await FlowNode.findById(req.params.id);
    if (!node) {
      return res.status(404).json({ message: "Nodo no encontrado" });
    }

    const type = node.node_type;

    // 🔹 NODO DE OPCIONES
    if (type === "options") {
      const { connections } = req.body;

      if (!Array.isArray(connections)) {
        return res.status(400).json({ message: "Conexiones inválidas" });
      }

      connections.forEach(c => {
        if (node.options?.[c.option_index]) {
          node.options[c.option_index].next_node_id = c.next_node_id;
        }
      });
    }
    // 🔹 NODOS LINEALES
    else {
      const { next_node_id } = req.body;

      if (!next_node_id) {
        return res.status(400).json({
          message: `next_node_id requerido para nodos tipo ${type}`
        });
      }

      node.next_node_id = next_node_id;
    }

    await node.save();
    res.json(node);
  } catch (error) {
    console.error("connectNode error:", error);
    res.status(500).json({ message: "Error al conectar nodos" });
  }
};
