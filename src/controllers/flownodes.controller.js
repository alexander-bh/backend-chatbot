const mongoose = require("mongoose");
const FlowNode = require("../models/FlowNode");
const { validateCreateNode } = require("../validators/flowNode.validator");
const normalizeLinkAction = require("../utils/normalizeLinkAction");
const { getEditableFlow } = require("../utils/flow.utils");

// Crear nodos
exports.createNode = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const {
      flow_id,
      node_type,
      content,
      options = [],
      parent_node_id = null,
      variable_key,
      typing_time = 2,
      link_action,
      crm_field_key,
      validation
    } = req.body;

    await getEditableFlow(flow_id, req.user.account_id);

    await validateCreateNode({
      flow_id,
      node_type,
      content,
      variable_key
    });

    if (typing_time < 0 || typing_time > 10) {
      throw new Error("typing_time inválido");
    }

    const order = await FlowNode.countDocuments({
      flow_id,
      parent_node_id,
      account_id: req.user.account_id
    }).session(session);

    const [node] = await FlowNode.create(
      [{
        account_id: req.user.account_id,
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
        options:
          node_type === "options"
            ? options.map(o => ({
              label: o.label.trim(),
              next_node_id: null
            }))
            : [],
        is_draft: true
      }],
      { session }
    );

    await session.commitTransaction();
    res.status(201).json(node);

  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

// Conectar nodos 
exports.connectNode = async (req, res) => {
  try {
    const source = await FlowNode.findOne({
      _id: req.params.id,
      account_id: req.user.account_id
    });

    if (!source) {
      return res.status(404).json({ message: "Nodo no encontrado" });
    }

    await getEditableFlow(source.flow_id, req.user.account_id);

    let targetId;

    if (source.node_type === "options") {
      const { option_index, target_node_id } = req.body;

      if (!source.options?.[option_index]) {
        return res.status(400).json({ message: "Opción inválida" });
      }

      targetId = target_node_id;
    } else {
      targetId = req.body.next_node_id;
    }

    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      return res.status(400).json({ message: "Nodo destino inválido" });
    }

    if (targetId === String(source._id)) {
      return res.status(400).json({ message: "No se puede conectar un nodo consigo mismo" });
    }

    const target = await FlowNode.findOne({
      _id: targetId,
      flow_id: source.flow_id,
      account_id: req.user.account_id
    });

    if (!target) {
      return res.status(400).json({ message: "Nodo destino inválido" });
    }

    if (source.node_type === "options") {
      source.options[req.body.option_index].next_node_id = target._id;
    } else {
      source.next_node_id = target._id;
    }

    source.is_draft = true;
    await source.save();

    res.json({ message: "Nodos conectados correctamente" });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Obtener nodos por flow
exports.getNodesByFlow = async (req, res) => {
  try {
    const { flowId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(flowId)) {
      return res.status(400).json({ message: "flowId inválido" });
    }

    await getEditableFlow(flowId, req.user.account_id);

    const nodes = await FlowNode.find({
      flow_id: flowId,
      account_id: req.user.account_id
    }).sort({ parent_node_id: 1, order: 1 });

    res.json(nodes);

  } catch (error) {
    res.status(403).json({ message: error.message });
  }
};

// Actualizar nodos
exports.updateNode = async (req, res) => {
  try {
    const node = await FlowNode.findOne({
      _id: req.params.id,
      account_id: req.user.account_id
    });

    if (!node) {
      return res.status(404).json({ message: "Nodo no encontrado" });
    }

    await getEditableFlow(node.flow_id, req.user.account_id);

    const allowed = [
      "content",
      "options",
      "variable_key",
      "crm_field_key",
      "validation",
      "typing_time",
      "link_action"
    ];

    for (const field of allowed) {
      if (req.body[field] !== undefined) {

        if (field === "typing_time" && (req.body[field] < 0 || req.body[field] > 10)) {
          throw new Error("typing_time inválido");
        }

        if (field === "options") {
          node.options = req.body.options.map(o => ({
            label: o.label?.trim(),
            next_node_id: o.next_node_id ?? null
          }));
          continue;
        }

        if (field === "options" && node.node_type !== "options") {
          throw new Error("Este nodo no admite opciones");
        }

        node[field] =
          field === "link_action"
            ? normalizeLinkAction(req.body[field])
            : req.body[field];
      }
    }

    node.is_draft = true;
    await node.save();

    res.json(node);

  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Duplicar nodos
exports.duplicateNode = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const node = await FlowNode.findOne({
      _id: req.params.id,
      account_id: req.user.account_id
    }).session(session);

    if (!node) throw new Error("Nodo no encontrado");

    await getEditableFlow(node.flow_id, req.user.account_id);

    const order = await FlowNode.countDocuments({
      flow_id: node.flow_id,
      parent_node_id: node.parent_node_id,
      account_id: req.user.account_id
    }).session(session);

    const clone = node.toObject();
    delete clone._id;

    const [newNode] = await FlowNode.create(
      [{ ...clone, order, is_draft: true }],
      { session }
    );

    await session.commitTransaction();
    res.status(201).json(newNode);

  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

// Eliminar nodos
exports.deleteNode = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const node = await FlowNode.findOne({
      _id: req.params.id,
      account_id: req.user.account_id
    }).session(session);

    if (!node) {
      return res.status(404).json({ message: "Nodo no encontrado" });
    }

    await getEditableFlow(node.flow_id, req.user.account_id);

    await FlowNode.updateMany(
      {
        flow_id: node.flow_id,
        parent_node_id: node.parent_node_id,
        account_id: req.user.account_id,
        order: { $gt: node.order }
      },
      { $inc: { order: -1 } },
      { session }
    );

    await FlowNode.updateMany(
      {
        next_node_id: node._id,
        account_id: req.user.account_id
      },
      { $set: { next_node_id: null } },
      { session }
    );

    await FlowNode.updateMany(
      {
        "options.next_node_id": node._id,
        account_id: req.user.account_id
      },
      {
        $set: { "options.$[opt].next_node_id": null }
      },
      {
        arrayFilters: [{ "opt.next_node_id": node._id }],
        session
      }
    );
    await FlowNode.deleteOne({ _id: node._id }, { session });

    await session.commitTransaction();
    res.json({ message: "Nodo eliminado correctamente" });

  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

// Insertar despues 
exports.insertAfterNode = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const prev = await FlowNode.findOne({
      _id: req.params.id,
      account_id: req.user.account_id
    }).session(session);

    if (!prev) throw new Error("Nodo no encontrado");

    await getEditableFlow(prev.flow_id, req.user.account_id);

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
        account_id: req.user.account_id,
        order: { $gt: prev.order }
      },
      { $inc: { order: 1 } },
      { session }
    );

    const [newNode] = await FlowNode.create(
      [{
        account_id: req.user.account_id,
        flow_id: prev.flow_id,
        node_type: req.body.node_type,
        content: req.body.content ?? null,
        parent_node_id: prev.parent_node_id,
        order: prev.order + 1,
        typing_time: req.body.typing_time ?? 2,
        options:
          req.body.node_type === "options"
            ? (req.body.options ?? []).map(o => ({
              label: o.label.trim(),
              next_node_id: null
            }))
            : [],
        is_draft: true
      }],
      { session }
    );

    prev.is_draft = true;
    await prev.save({ session });

    await session.commitTransaction();
    res.status(201).json(newNode);

  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

// Reorden de nodos 
exports.reorderNodes = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const {
      flow_id,
      parent_node_id = null,
      nodes
    } = req.body;

    if (!mongoose.Types.ObjectId.isValid(flow_id)) {
      return res.status(400).json({ message: "flow_id inválido" });
    }

    if (!Array.isArray(nodes) || nodes.length === 0) {
      return res.status(400).json({ message: "nodes inválido" });
    }

    await getEditableFlow(flow_id, req.user.account_id);

    session.startTransaction();

    const nodeIds = nodes.map(n => n.node_id);

    const filter = {
      _id: { $in: nodeIds },
      flow_id,
      account_id: req.user.account_id
    };

    if (parent_node_id === null) {
      filter.$or = [
        { parent_node_id: null },
        { parent_node_id: { $exists: false } }
      ];
    } else {
      filter.parent_node_id = parent_node_id;
    }

    const count = await FlowNode.countDocuments(filter).session(session);

    if (count !== nodes.length) {
      throw new Error("Nodos inválidos para este nivel");
    }

    if (!nodes.every(n => mongoose.Types.ObjectId.isValid(n.node_id))) {
      throw new Error("node_id inválido");
    }

    const bulk = nodes.map((n, index) => ({
      updateOne: {
        filter: {
          _id: n.node_id,
          flow_id,
          account_id: req.user.account_id,
          ...(parent_node_id === null
            ? { $or: [{ parent_node_id: null }, { parent_node_id: { $exists: false } }] }
            : { parent_node_id })
        },
        update: {
          $set: {
            order: index,
            is_draft: true
          }
        }
      }
    }));

    await FlowNode.bulkWrite(bulk, { session });

    await session.commitTransaction();
    res.json({ message: "Orden actualizado correctamente" });

  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

// Actualizar canvas
exports.updateCanvas = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { flow_id, nodes } = req.body;

    if (!mongoose.Types.ObjectId.isValid(flow_id)) {
      return res.status(400).json({ message: "flow_id inválido" });
    }

    if (!Array.isArray(nodes) || !nodes.length) {
      return res.status(400).json({ message: "nodes inválido" });
    }

    await getEditableFlow(flow_id, req.user.account_id);

    session.startTransaction();

    const count = await FlowNode.countDocuments({
      _id: { $in: nodes.map(n => n.node_id) },
      flow_id,
      account_id: req.user.account_id
    }).session(session);

    if (count !== nodes.length) {
      throw new Error("Uno o más nodos no pertenecen al flow");
    }

    const bulk = nodes.map(n => ({
      updateOne: {
        filter: {
          _id: n.node_id,
          flow_id,
          account_id: req.user.account_id
        },
        update: {
          position: {
            x: Number(n.position?.x ?? 0),
            y: Number(n.position?.y ?? 0)
          },
          is_draft: true
        }
      }
    }));

    await FlowNode.bulkWrite(bulk, { session });

    await session.commitTransaction();
    res.json({ message: "Canvas actualizado correctamente" });

  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
};








// Reoder subarbol
exports.reorderSubtree = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { flow_id, parent_node_id = null, nodes } = req.body;

    if (!Array.isArray(nodes) || !nodes.length) {
      return res.status(400).json({ message: "nodes inválido" });
    }

    await getEditableFlow(flow_id, req.user.account_id);

    session.startTransaction();

    const count = await FlowNode.countDocuments({
      _id: { $in: nodes.map(n => n.node_id) },
      flow_id,
      parent_node_id,
      account_id: req.user.account_id
    }).session(session);

    if (count !== nodes.length) {
      throw new Error("Nodos inválidos para este nivel");
    }

    const bulk = nodes.map((node, index) => ({
      updateOne: {
        filter: {
          _id: node.id,
          flow_id,
          parent_node_id,
          account_id: req.user.account_id
        },
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
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
};



