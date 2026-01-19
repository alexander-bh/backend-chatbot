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
      return res.status(400).json({ message: "flow_id y node_type son requeridos" });
    }

    const flow = await Flow.findById(flow_id);
    if (!flow) {
      return res.status(404).json({ message: "Flow no encontrado" });
    }

    const nodeData = {
      flow_id,
      node_type,
      position: position || { x: 0, y: 0 }
    };

    switch (node_type) {
      case "text":
      case "question":
        if (!content) {
          return res.status(400).json({
            message: `content es requerido para nodos tipo ${node_type}`
          });
        }
        nodeData.content = content;
        nodeData.next_node_id = next_node_id || null;
        break;

      case "options":
        if (!Array.isArray(options) || options.length === 0) {
          return res.status(400).json({
            message: "options debe ser un arreglo con al menos una opción"
          });
        }
        nodeData.content = content || null;
        nodeData.options = options.map(opt => ({
          label: opt.label,
          next_node_id: opt.next_node_id || null
        }));
        break;

      case "email":
      case "phone":
      case "number":
        nodeData.content = content || null;
        nodeData.next_node_id = next_node_id || null;
        break;

      default:
        return res.status(400).json({ message: "node_type no soportado" });
    }

    const node = await FlowNode.create(nodeData);
    res.status(201).json(node);

  } catch (error) {
    console.error("createNode error:", error);
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
  try {
    const node = await FlowNode.findById(req.params.id);
    if (!node) {
      return res.status(404).json({ message: "Nodo no encontrado" });
    }

    const allowedFields = ["content", "options", "next_node_id", "position"];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        node[field] = req.body[field];
      }
    });

    // Validaciones según tipo
    if (node.node_type === "options") {
      if (!Array.isArray(node.options) || node.options.length === 0) {
        return res.status(400).json({
          message: "Un nodo de opciones debe tener al menos una opción"
        });
      }
    }

    if (
      node.node_type !== "options" &&
      node.node_type !== "text" &&
      node.next_node_id === undefined
    ) {
      node.next_node_id = null;
    }

    await node.save();
    res.json(node);

  } catch (error) {
    console.error("updateNode error:", error);
    res.status(500).json({ message: "Error al actualizar nodo" });
  }
};


exports.deleteNode = async (req, res) => {
  await FlowNode.findByIdAndDelete(req.params.id);
  res.json({ message: "Nodo eliminado" });
};


exports.updateCanvas = async (req, res) => {
  try {
    const { flow_id, nodes } = req.body;

    if (!flow_id || !Array.isArray(nodes)) {
      return res.status(400).json({
        message: "flow_id y nodes son requeridos"
      });
    }

    const flow = await Flow.findById(flow_id);
    if (!flow) {
      return res.status(404).json({ message: "Flow no encontrado" });
    }

    const operations = nodes.map(n => {
      return FlowNode.findOneAndUpdate(
        { _id: n._id, flow_id },
        {
          position: n.position,
          content: n.content,
          options: n.options,
          next_node_id: n.next_node_id
        },
        { new: true }
      );
    });

    await Promise.all(operations);

    res.json({ message: "Canvas actualizado correctamente" });

  } catch (error) {
    console.error("updateCanvas error:", error);
    res.status(500).json({ message: "Error al actualizar canvas" });
  }
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
