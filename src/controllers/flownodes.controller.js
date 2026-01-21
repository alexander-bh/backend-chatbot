const mongoose = require("mongoose");
const Flow = require("../models/Flow");
const FlowNode = require("../models/FlowNode");
const { validateCreateNode } = require("../validators/flowNode.validator");
const normalizeLinkAction = require("../utils/normalizeLinkAction");

// Crear nodo
exports.createNode = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const {
      flow_id,
      node_type,
      content,
      options,
      parent_node_id = null,
      variable_key,
      typing_time = 2,
      link_action,
      crm_field_key,
      validation
    } = req.body;

    if (!mongoose.Types.ObjectId.isValid(flow_id)) {
      return res.status(400).json({ message: "flow_id inválido" });
    }

    const flow = await Flow.findOne({
      _id: flow_id,
      account_id: req.user.account_id
    });

    if (!flow) {
      return res.status(403).json({ message: "No autorizado" });
    }

    if (flow.is_active) {
      return res.status(400).json({
        message: "No puedes modificar un flow publicado"
      });
    }

    await validateCreateNode({
      flow_id,
      node_type,
      content,
      variable_key
    });

    if (typing_time < 0 || typing_time > 10) {
      return res.status(400).json({ message: "typing_time inválido" });
    }

    session.startTransaction();

    const order = await FlowNode.countDocuments(
      { flow_id, parent_node_id },
      { session }
    );

    const nodeData = {
      flow_id,
      node_type,
      content: content ?? null,
      parent_node_id,
      order,
      typing_time,
      variable_key: variable_key ?? null,
      crm_field_key: crm_field_key ?? null,
      validation: validation ?? null,
      link_action: link_action ? normalizeLinkAction(link_action) : null,
      next_node_id: null,
      options: null,
      is_draft: true
    };

    if (node_type === "options") {
      if (!Array.isArray(options) || !options.length) {
        throw new Error("options inválidas");
      }

      nodeData.options = options.map(o => ({
        label: o.label.trim(),
        next_node_id: null
      }));
    }

    const [node] = await FlowNode.create([nodeData], { session });

    await session.commitTransaction();
    res.status(201).json(node);

  } catch (error) {
    await session.abortTransaction();
    console.error("createNode:", error);
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

// Conectar nodos
exports.connectNode = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID inválido" });
    }

    const source = await FlowNode.findById(id);
    if (!source) {
      return res.status(404).json({ message: "Nodo no encontrado" });
    }

    const flow = await Flow.findOne({
      _id: source.flow_id,
      account_id: req.user.account_id
    });

    if (!flow || flow.is_active) {
      return res.status(400).json({
        message: "No puedes modificar este flow"
      });
    }

    let targetId;

    if (source.node_type === "options") {
      const { option_index, target_node_id } = req.body;

      if (!source.options?.[option_index]) {
        return res.status(400).json({ message: "Opción inválida" });
      }

      targetId = target_node_id;
      source.options[option_index].next_node_id = targetId;
    } else {
      targetId = req.body.next_node_id;
      source.next_node_id = targetId;
    }

    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      return res.status(400).json({ message: "Target inválido" });
    }

    if (String(targetId) === String(source._id)) {
      return res.status(400).json({ message: "Loop no permitido" });
    }

    const target = await FlowNode.findById(targetId);
    if (!target || !target.flow_id.equals(source.flow_id)) {
      return res.status(400).json({ message: "Nodo destino inválido" });
    }

    // Reordenar si ya tenía padre
    if (target.parent_node_id) {
      await FlowNode.updateMany(
        {
          flow_id: target.flow_id,
          parent_node_id: target.parent_node_id,
          order: { $gt: target.order }
        },
        { $inc: { order: -1 } }
      );
    }

    target.parent_node_id = source._id;
    target.order = await FlowNode.countDocuments({
      flow_id: source.flow_id,
      parent_node_id: source._id
    });

    source.is_draft = true;

    await target.save();
    await source.save();

    res.json({ message: "Nodos conectados correctamente" });

  } catch (error) {
    console.error("connectNode:", error);
    res.status(500).json({ message: "Error al conectar nodos" });
  }
};

// Obtener nodos por flow
exports.getNodesByFlow = async (req, res) => {
  try {
    const { flowId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(flowId)) {
      return res.status(400).json({ message: "flowId inválido" });
    }

    const flow = await Flow.findOne({
      _id: flowId,
      account_id: req.user.account_id
    });

    if (!flow) {
      return res.status(403).json({ message: "No autorizado" });
    }

    const nodes = await FlowNode.find({ flow_id: flowId })
      .sort({ parent_node_id: 1, order: 1 });

    res.json(nodes);
  } catch (error) {
    console.error("getNodesByFlow error:", error);
    res.status(500).json({ message: "Error al obtener nodos" });
  }
};

// Actualizar nodo
exports.updateNode = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID inválido" });
    }

    const node = await FlowNode.findById(id);
    if (!node) {
      return res.status(404).json({ message: "Nodo no encontrado" });
    }

    const flow = await Flow.findOne({
      _id: node.flow_id,
      account_id: req.user.account_id
    });

    if (!flow || flow.is_active) {
      return res.status(400).json({
        message: "No puedes modificar este flow"
      });
    }

    const allowed = [
      "content",
      "options",
      "variable_key",
      "crm_field_key",
      "validation",
      "typing_time",
      "link_action"
    ];

    allowed.forEach(field => {
      if (req.body[field] !== undefined) {
        node[field] = field === "link_action"
          ? normalizeLinkAction(req.body[field])
          : req.body[field];
      }
    });

    node.is_draft = true;
    await node.save();

    res.json(node);
  } catch (error) {
    console.error("updateNode error:", error);
    res.status(500).json({ message: "Error al actualizar nodo" });
  }
};

// Duplicar nodo
exports.duplicateNode = async (req, res) => {
  try {
    const { id } = req.params;

    const node = await FlowNode.findById(id);
    if (!node) {
      return res.status(404).json({ message: "Nodo no encontrado" });
    }

    const flow = await Flow.findOne({
      _id: node.flow_id,
      account_id: req.user.account_id
    });

    if (!flow || flow.is_active) {
      return res.status(400).json({
        message: "No puedes modificar este flow"
      });
    }

    const clone = node.toObject();
    delete clone._id;

    const count = await FlowNode.countDocuments({
      flow_id: node.flow_id,
      parent_node_id: node.parent_node_id
    });

    const newNode = await FlowNode.create({
      ...clone,
      order: count,
      is_draft: true
    });

    res.status(201).json(newNode);
  } catch (error) {
    console.error("duplicateNode error:", error);
    res.status(500).json({ message: "Error al duplicar nodo" });
  }
};

// Insertar nodo después de otro
exports.insertAfterNode = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID inválido" });
    }

    const prev = await FlowNode.findById(id);
    if (!prev) {
      return res.status(404).json({ message: "Nodo no encontrado" });
    }

    const flow = await Flow.findOne({
      _id: prev.flow_id,
      account_id: req.user.account_id
    });

    if (!flow || flow.is_active) {
      return res.status(400).json({
        message: "No puedes modificar este flow"
      });
    }

    await validateCreateNode({
      flow_id: prev.flow_id,
      node_type: req.body.node_type,
      content: req.body.content,
      variable_key: req.body.variable_key
    });

    await FlowNode.updateMany(
      {
        flow_id: prev.flow_id,
        parent_node_id: prev.parent_node_id,
        order: { $gt: prev.order }
      },
      { $inc: { order: 1 } }
    );

    const newNode = await FlowNode.create({
      flow_id: prev.flow_id,
      node_type: req.body.node_type,
      content: req.body.content ?? null,
      parent_node_id: prev.parent_node_id,
      order: prev.order + 1,
      next_node_id: prev.next_node_id,
      typing_time: req.body.typing_time ?? 2,
      is_draft: true
    });

    prev.next_node_id = newNode._id;
    await prev.save();

    res.status(201).json(newNode);

  } catch (error) {
    console.error("insertAfterNode:", error);
    res.status(500).json({ message: error.message });
  }
};

// Eliminar nodo
exports.deleteNode = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID inválido" });
    }

    const node = await FlowNode.findById(id);
    if (!node) {
      return res.status(404).json({ message: "Nodo no encontrado" });
    }

    await FlowNode.updateMany(
      {
        flow_id: node.flow_id,
        parent_node_id: node.parent_node_id,
        order: { $gt: node.order }
      },
      { $inc: { order: -1 } }
    );

    await FlowNode.updateMany(
      { next_node_id: node._id },
      { $set: { next_node_id: null } }
    );

    await FlowNode.updateMany(
      { "options.next_node_id": node._id },
      { $set: { "options.$[].next_node_id": null } }
    );

    await FlowNode.deleteOne({ _id: node._id });

    res.json({ message: "Nodo eliminado" });

  } catch (error) {
    console.error("deleteNode:", error);
    res.status(500).json({ message: error.message });
  }
};

// Actualizar posiciones del canvas
exports.updateCanvas = async (req, res) => {
  try {
    if (!Array.isArray(req.body.nodes)) {
      return res.status(400).json({ message: "nodes inválido" });
    }

    const bulk = req.body.nodes.map(n => ({
      updateOne: {
        filter: { _id: n.id },
        update: { position: n.position }
      }
    }));

    if (bulk.length) {
      await FlowNode.bulkWrite(bulk);
    }

    res.json({ message: "Canvas actualizado" });

  } catch (error) {
    console.error("updateCanvas:", error);
    res.status(500).json({ message: "Error al actualizar canvas" });
  }
};

// Reordenar nodos
exports.reorderNodes = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { flow_id, parent_node_id = null, nodes } = req.body;

    if (!Array.isArray(nodes) || nodes.length === 0) {
      return res.status(400).json({ message: "nodes inválido" });
    }

    session.startTransaction();

    // Seguridad: validar flow
    const flow = await Flow.findOne({
      _id: flow_id,
      account_id: req.user.account_id,
      is_active: false
    });

    if (!flow) {
      throw new Error("Flow no editable");
    }

    const bulk = nodes.map((node, index) => ({
      updateOne: {
        filter: {
          _id: node.id,
          flow_id,
          parent_node_id
        },
        update: {
          order: index,
          is_draft: true
        }
      }
    }));

    await FlowNode.bulkWrite(bulk, { session });

    await session.commitTransaction();

    res.json({ message: "Orden actualizado correctamente" });

  } catch (error) {
    await session.abortTransaction();
    console.error("reorderNodes error:", error);
    res.status(400).json({ message: error.message });

  } finally {
    session.endSession();
  }
};

// Reordenar subárbol
exports.reorderSubtree = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { flow_id, parent_node_id = null, nodes } = req.body;

    if (!Array.isArray(nodes) || !nodes.length) {
      return res.status(400).json({ message: "nodes inválido" });
    }

    session.startTransaction();

    const flow = await Flow.findOne({
      _id: flow_id,
      account_id: req.user.account_id,
      is_active: false
    });

    if (!flow) {
      throw new Error("Flow no editable");
    }

    // 🔒 Seguridad: todos deben pertenecer al mismo nivel
    const count = await FlowNode.countDocuments({
      _id: { $in: nodes.map(n => n.id) },
      flow_id,
      parent_node_id
    });

    if (count !== nodes.length) {
      throw new Error("Nodos inválidos para este nivel");
    }

    const bulk = nodes.map((node, index) => ({
      updateOne: {
        filter: { _id: node.id },
        update: {
          order: index,
          is_draft: true
        }
      }
    }));

    await FlowNode.bulkWrite(bulk, { session });

    await session.commitTransaction();
    res.json({ message: "Subárbol reordenado correctamente" });

  } catch (error) {
    await session.abortTransaction();
    console.error("reorderSubtree error:", error);
    res.status(400).json({ message: error.message });

  } finally {
    session.endSession();
  }
};



