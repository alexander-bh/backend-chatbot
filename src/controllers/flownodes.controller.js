const FlowNode = require("../models/FlowNode");
const Flow = require("../models/Flow");

const INPUT_NODES = ["question", "email", "phone", "number"];

//crear nodo
exports.createNode = async (req, res) => {
  try {
    const {
      flow_id,
      node_type,
      content,
      options,
      next_node_id,
      position,
      variable_key
    } = req.body;

    if (!flow_id || !node_type) {
      return res.status(400).json({
        message: "flow_id y node_type son requeridos"
      });
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
        if (!content) {
          return res.status(400).json({
            message: "content es requerido para nodos tipo text"
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

        for (const opt of options) {
          if (!opt.label) {
            return res.status(400).json({
              message: "Cada opción debe tener label"
            });
          }
        }

        nodeData.content = content || null;
        nodeData.options = options.map(opt => ({
          label: opt.label,
          next_node_id: opt.next_node_id || null
        }));
        break;

      case "question":
      case "email":
      case "phone":
      case "number":
        if (!content || !variable_key) {
          return res.status(400).json({
            message: `content y variable_key son requeridos para nodos tipo ${node_type}`
          });
        }

        nodeData.content = content;
        nodeData.variable_key = variable_key;
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


//obterner nodos por flow
exports.getNodesByFlow = async (req, res) => {
  try {
    const nodes = await FlowNode.find({
      flow_id: req.params.flowId
    }).sort({ createdAt: 1 });

    res.json(nodes);
  } catch (error) {
    res.status(500).json({ message: "Error al obtener nodos" });
  }
};

//actualizar nodo
exports.updateNode = async (req, res) => {
  try {
    const node = await FlowNode.findById(req.params.id);
    if (!node) {
      return res.status(404).json({ message: "Nodo no encontrado" });
    }

    if (req.body.options && node.node_type !== "options") {
      return res.status(400).json({
        message: "Solo nodos tipo options pueden tener opciones"
      });
    }

    const allowedFields = ["content", "options", "variable_key"];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        node[field] = req.body[field];
      }
    });

    // Validaciones
    if (node.node_type === "options") {
      if (!Array.isArray(node.options) || node.options.length === 0) {
        return res.status(400).json({
          message: "Un nodo de opciones debe tener al menos una opción"
        });
      }

      for (const opt of node.options) {
        if (!opt.label) {
          return res.status(400).json({
            message: "Cada opción debe tener label"
          });
        }
      }
    }

    if (
      INPUT_NODES.includes(node.node_type) &&
      !node.variable_key
    ) {
      return res.status(400).json({
        message: `variable_key es requerido para nodos tipo ${node.node_type}`
      });
    }

    await node.save();
    res.json(node);

  } catch (error) {
    console.error("updateNode error:", error);
    res.status(500).json({ message: "Error al actualizar nodo" });
  }
};

//eliminar nodo
exports.deleteNode = async (req, res) => {
  try {
    const node = await FlowNode.findById(req.params.id);
    if (!node) {
      return res.status(404).json({ message: "Nodo no encontrado" });
    }

    await FlowNode.updateMany(
      { flow_id: node.flow_id, next_node_id: node._id },
      { $set: { next_node_id: null } }
    );

    await FlowNode.updateMany(
      { flow_id: node.flow_id, "options.next_node_id": node._id },
      { $set: { "options.$[].next_node_id": null } }
    );

    await node.deleteOne();

    res.json({ message: "Nodo eliminado y conexiones limpiadas" });

  } catch (error) {
    res.status(500).json({ message: "Error al eliminar nodo" });
  }
};


//actualizar canvas
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

    const operations = nodes.map(n =>
      FlowNode.findOneAndUpdate(
        { _id: n._id, flow_id },
        { position: n.position },
        { new: true }
      )
    );

    await Promise.all(operations);

    res.json({ message: "Canvas actualizado correctamente" });

  } catch (error) {
    console.error("updateCanvas error:", error);
    res.status(500).json({ message: "Error al actualizar canvas" });
  }
};


//conectar nodos
exports.connectNode = async (req, res) => {
  try {
    const node = await FlowNode.findById(req.params.id);
    if (!node) {
      return res.status(404).json({ message: "Nodo no encontrado" });
    }

    if (node.node_type === "options") {
      const { option_index, target_node_id } = req.body;

      if (
        !Number.isInteger(option_index) ||
        option_index < 0 ||
        !node.options?.[option_index] ||
        !target_node_id
      ) {
        return res.status(400).json({
          message: "option_index o target_node_id inválidos"
        });
      }

      node.options[option_index].next_node_id = target_node_id;

    } else {
      const { next_node_id } = req.body;

      if (!next_node_id) {
        return res.status(400).json({
          message: "next_node_id requerido"
        });
      }

      node.next_node_id = next_node_id;
    }

    const targetId =
      node.node_type === "options"
        ? req.body.target_node_id
        : req.body.next_node_id;

    if (String(targetId) === String(node._id)) {
      return res.status(400).json({
        message: "Un nodo no puede conectarse a sí mismo"
      });
    }

    const targetNode = await FlowNode.findById(targetId);
    if (!targetNode || !targetNode.flow_id.equals(node.flow_id)) {
      return res.status(400).json({
        message: "No puedes conectar nodos de distintos flows"
      });
    }

    node.is_draft = false;
    await node.save();

    res.json(node);

  } catch (error) {
    console.error("connectNode error:", error);
    res.status(500).json({ message: "Error al conectar nodos" });
  }
};
