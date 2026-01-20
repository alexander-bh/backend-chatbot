const mongoose = require("mongoose");
const FlowNode = require("../models/FlowNode");
const Flow = require("../models/Flow");

const INPUT_NODES = ["question", "email", "phone", "number"];
const VARIABLE_KEY_REGEX = /^[a-z0-9_]+$/;

// CREAR NODO
exports.createNode = async (req, res) => {
  try {
    const {
      flow_id,
      node_type,
      content,
      options,
      next_node_id,
      position,
      variable_key,
      typing_time,
      link_action,
      crm_field_key,
      validation
    } = req.body;

    if (!flow_id || !node_type) {
      return res.status(400).json({
        message: "flow_id y node_type son requeridos"
      });
    }

    if (
      typing_time !== undefined &&
      (typeof typing_time !== "number" || typing_time < 0)
    ) {
      return res.status(400).json({
        message: "typing_time debe ser un número >= 0"
      });
    }

    const flow = await Flow.findById(flow_id);
    if (!flow) {
      return res.status(404).json({ message: "Flow no encontrado" });
    }

    // 🔐 Validar variable_key para inputs
    if (INPUT_NODES.includes(node_type)) {
      if (!content || !variable_key) {
        return res.status(400).json({
          message: `content y variable_key son requeridos para ${node_type}`
        });
      }

      if (!VARIABLE_KEY_REGEX.test(variable_key)) {
        return res.status(400).json({
          message: "variable_key solo puede contener minúsculas, números y _"
        });
      }

      const exists = await FlowNode.findOne({ flow_id, variable_key });
      if (exists) {
        return res.status(400).json({
          message: "variable_key ya existe en este flow"
        });
      }
    }

    const nodeData = {
      flow_id,
      node_type,
      position: position || { x: 0, y: 0 },
      typing_time,
      is_draft: true
    };

    // TIPOS DE NODO
    switch (node_type) {
      case "text":
        if (!content) {
          return res.status(400).json({
            message: "content es requerido para text"
          });
        }
        nodeData.content = content;
        nodeData.next_node_id = next_node_id || null;
        break;

      case "question":
      case "email":
      case "phone":
      case "number":
        nodeData.content = content;
        nodeData.variable_key = variable_key;
        nodeData.crm_field_key = crm_field_key ?? null;
        nodeData.validation = validation ?? null;
        nodeData.next_node_id = next_node_id || null;
        break;

      case "options":
        if (!Array.isArray(options) || options.length === 0) {
          return res.status(400).json({
            message: "options debe tener al menos una opción"
          });
        }

        nodeData.options = options.map(opt => {
          if (!opt.label) {
            throw new Error("Cada opción debe tener label");
          }

          return {
            label: opt.label,
            next_node_id: opt.next_node_id || null
          };
        });
        nodeData.content = content || null;
        break;

      case "jump":
        if (!next_node_id) {
          return res.status(400).json({
            message: "next_node_id es requerido para jump"
          });
        }
        nodeData.next_node_id = next_node_id;
        break;

      // 🟢 NODO LINK
      case "link":
        if (!content || !link_action) {
          return res.status(400).json({
            message: "content y link_action son requeridos"
          });
        }

        if (!link_action.type || !link_action.title || !link_action.value) {
          return res.status(400).json({
            message: "link_action incompleto"
          });
        }

        nodeData.content = content;
        nodeData.link_action = normalizeLinkAction(link_action);
        nodeData.next_node_id = next_node_id || null;
        break;

      default:
        return res.status(400).json({
          message: "node_type no soportado"
        });
    }

    const node = await FlowNode.create(nodeData);
    res.status(201).json(node);

  } catch (error) {
    console.error("createNode error:", error.message);
    res.status(500).json({ message: error.message || "Error al crear nodo" });
  }
};

// OBTENER NODOS POR FLOW
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

// ACTUALIZAR NODO
exports.updateNode = async (req, res) => {
  try {
    const node = await FlowNode.findById(req.params.id);
    if (!node) {
      return res.status(404).json({ message: "Nodo no encontrado" });
    }

    const allowedFields = [
      "content",
      "options",
      "typing_time",
      "link_action",
      "variable_key",
      "crm_field_key",
      "validation"
    ];

    if (
      req.body.typing_time !== undefined &&
      (typeof req.body.typing_time !== "number" || req.body.typing_time < 0)
    ) {
      return res.status(400).json({
        message: "typing_time inválido"
      });
    }

    if (req.body.validation) {
      if (!Array.isArray(req.body.validation.rules)) {
        return res.status(400).json({
          message: "validation.rules debe ser un arreglo"
        });
      }
    }

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        if (
          field === "variable_key" &&
          INPUT_NODES.includes(node.node_type)
        ) {
          if (!VARIABLE_KEY_REGEX.test(req.body.variable_key)) {
            return res.status(400).json({
              message: "variable_key inválido"
            });
          }

          const exists = await FlowNode.findOne({
            flow_id: node.flow_id,
            variable_key: req.body.variable_key,
            _id: { $ne: node._id }
          });

          if (exists) {
            return res.status(400).json({
              message: "variable_key ya existe"
            });
          }
        }

        node[field] = field === "link_action"
          ? normalizeLinkAction(req.body.link_action)
          : req.body[field];
      }
    }

    // Validación final link
    if (node.node_type === "link") {
      const la = node.link_action;
      if (!la?.type || !la?.title || !la?.value) {
        return res.status(400).json({
          message: "link_action inválido"
        });
      }
    }

    await node.save();
    res.json(node);

  } catch (error) {
    console.error("updateNode error:", error.message);
    res.status(500).json({ message: error.message || "Error al actualizar nodo" });
  }
};

// ELIMINAR NODO
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
      {
        flow_id: node.flow_id,
        "options.next_node_id": node._id
      },
      {
        $set: {
          "options.$[opt].next_node_id": null
        }
      },
      {
        arrayFilters: [{ "opt.next_node_id": node._id }]
      }
    );

    await node.deleteOne();
    res.json({ message: "Nodo eliminado y conexiones limpiadas" });

  } catch (error) {
    console.error("deleteNode error:", error.message);
    res.status(500).json({ message: "Error al eliminar nodo" });
  }
};

// CONECTAR NODOS
exports.connectNode = async (req, res) => {
  try {
    const node = await FlowNode.findById(req.params.id);
    if (!node) {
      return res.status(404).json({ message: "Nodo no encontrado" });
    }

    let targetId;

    if (node.node_type === "options") {
      const { option_index, target_node_id } = req.body;

      if (
        !Number.isInteger(option_index) ||
        option_index < 0 ||
        !node.options?.[option_index] ||
        !target_node_id ||
        !mongoose.Types.ObjectId.isValid(target_node_id)
      ) {
        return res.status(400).json({
          message: "option_index o target_node_id inválidos"
        });
      }

      node.options[option_index].next_node_id = target_node_id;
      targetId = target_node_id;

    } else {
      const { next_node_id } = req.body;

      if (
        !next_node_id ||
        !mongoose.Types.ObjectId.isValid(next_node_id)
      ) {
        return res.status(400).json({
          message: "next_node_id inválido"
        });
      }

      node.next_node_id = next_node_id;
      targetId = next_node_id;
    }

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
    console.error("connectNode error:", error.message);
    res.status(500).json({ message: "Error al conectar nodos" });
  }
};

// DUPLICAR NODO
exports.duplicateNode = async (req, res) => {
  try {
    const original = await FlowNode.findById(req.params.id);
    if (!original) {
      return res.status(404).json({ message: "Nodo no encontrado" });
    }

    const duplicated = await FlowNode.create({
      flow_id: original.flow_id,
      node_type: original.node_type,
      content: original.content,
      options: original.options?.map(opt => ({
        label: opt.label,
        next_node_id: null
      })),
      variable_key: original.variable_key,
      crm_field_key: original.crm_field_key,
      validation: original.validation
        ? JSON.parse(JSON.stringify(original.validation))
        : null,
      typing_time: original.typing_time,
      link_action: original.link_action
        ? { ...original.link_action }
        : null,
      next_node_id: null,
      position: {
        x: original.position.x + 40,
        y: original.position.y + 40
      },
      is_draft: true
    });

    res.status(201).json(duplicated);

  } catch (error) {
    console.error("duplicateNode error:", error.message);
    res.status(500).json({ message: "Error al duplicar nodo" });
  }
};

// NORMALIZAR LINK ACTION
const normalizeLinkAction = (link) => {
  const result = { ...link };

  if (result.type === "whatsapp" && !result.value.startsWith("https://")) {
    result.value = `https://wa.me/${result.value}`;
  }

  if (result.type === "phone" && !result.value.startsWith("tel:")) {
    result.value = `tel:${result.value}`;
  }

  if (result.type === "email" && !result.value.startsWith("mailto:")) {
    result.value = `mailto:${result.value}`;
  }

  return result;
};
