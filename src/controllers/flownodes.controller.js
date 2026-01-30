const mongoose = require("mongoose");
const FlowNode = require("../models/FlowNode");
const Flow = require("../models/Flow");
const { validateCreateNode } = require("../validators/flowNode.validator");
const normalizeLinkAction = require("../utils/normalizeLinkAction");
const { getEditableFlow } = require("../utils/flow.utils");
const updateStartNode = require("../utils/updateStartNode");


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

    if (node_type === "options" && options.length === 0) {
      throw new Error("Options requerido para node_type options");
    }

    // ORDER GLOBAL
    const order = await FlowNode.countDocuments({
      flow_id,
      account_id: req.user.account_id
    }).session(session);

    const [node] = await FlowNode.create([
      {
        account_id: req.user.account_id,
        flow_id,
        node_type,
        content: content ?? null,
        order,
        typing_time,
        variable_key: variable_key ?? null,
        crm_field_key: crm_field_key ?? null,
        validation: validation ?? null,
        link_action: link_action ? normalizeLinkAction(link_action) : null,
        next_node_id: null,
        options:
          node_type === "options"
            ? options.map((o, i) => ({
                label: o.label?.trim(),
                value: o.value,
                order: o.order ?? i,
                next_node_id: null
              }))
            : [],
        is_draft: true
      }
    ], { session });

    await updateStartNode(flow_id, req.user.account_id, session);

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
      const { option_index, next_node_id } = req.body;

      if (typeof option_index !== "number" || !source.options?.[option_index]) {
        return res.status(400).json({ message: "Opción inválida" });
      }

      targetId = next_node_id;
    } else {
      targetId = req.body.next_node_id;
    }

    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      return res.status(400).json({ message: "Nodo destino inválido" });
    }

    // VALIDAR QUE EL TARGET EXISTE
    const target = await FlowNode.findOne({
      _id: targetId,
      flow_id: source.flow_id,
      account_id: req.user.account_id
    });

    if (!target) {
      return res.status(400).json({ message: "Nodo destino no existe" });
    }

    if (source.node_type === "options") {
      const { option_index } = req.body;
      source.options[option_index].next_node_id = targetId;
    } else {
      source.next_node_id = targetId;
    }

    source.is_draft = true;
    await source.save();

    await updateStartNode(source.flow_id, req.user.account_id);

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

    const flow = await Flow.findOne({
      _id: flowId,
      account_id: req.user.account_id
    });

    if (!flow) return res.status(404).json({ message: "Flow no encontrado" });

    const nodes = await FlowNode.find({
      flow_id: flowId,
      account_id: req.user.account_id
    }).sort({ order: 1 });

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

    if (!node) return res.status(404).json({ message: "Nodo no encontrado" });

    await getEditableFlow(node.flow_id, req.user.account_id);

    const allowed = [
      "content",
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

        node[field] =
          field === "link_action"
            ? normalizeLinkAction(req.body[field])
            : req.body[field];
      }
    }

    if (req.body.options && node.node_type === "options") {
      node.options = req.body.options.map((o, i) => ({
        label: o.label?.trim(),
        value: o.value,
        order: o.order ?? i,
        next_node_id: o.next_node_id ?? null
      }));
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

    // SHIFT ORDERS
    await FlowNode.updateMany(
      {
        flow_id: node.flow_id,
        account_id: req.user.account_id,
        order: { $gt: node.order }
      },
      { $inc: { order: 1 } },
      { session }
    );

    const clone = node.toObject();
    delete clone._id;

    if (clone.options?.length) {
      clone.options = clone.options.map(o => ({
        label: o.label,
        value: o.value,
        order: o.order,
        next_node_id: o.next_node_id ?? null
      }));
    }

    const [newNode] = await FlowNode.create(
      [
        {
          ...clone,
          order: node.order + 1,
          is_draft: true
        }
      ],
      { session }
    );

    node.is_draft = true;
    await node.save({ session });

    await updateStartNode(node.flow_id, req.user.account_id, session);

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

    // SHIFT ORDER
    await FlowNode.updateMany(
      {
        flow_id: node.flow_id,
        account_id: req.user.account_id,
        order: { $gt: node.order }
      },
      { $inc: { order: -1 } },
      { session }
    );

    // LIMPIAR CONEXIONES
    await FlowNode.updateMany(
      {
        flow_id: node.flow_id,
        account_id: req.user.account_id,
        next_node_id: node._id
      },
      { $set: { next_node_id: null } },
      { session }
    );

    await FlowNode.updateMany(
      {
        flow_id: node.flow_id,
        account_id: req.user.account_id,
        "options.next_node_id": node._id
      },
      { $set: { "options.$[opt].next_node_id": null } },
      {
        arrayFilters: [{ "opt.next_node_id": node._id }],
        session
      }
    );

    await FlowNode.deleteOne({ _id: node._id }, { session });

    await updateStartNode(node.flow_id, req.user.account_id, session);

    await session.commitTransaction();

    res.json({ message: "Nodo eliminado correctamente" });

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
    const { flow_id, nodes } = req.body;

    if (!Array.isArray(nodes) || nodes.length === 0) {
      throw new Error("nodes inválido");
    }

    await getEditableFlow(flow_id, req.user.account_id);

    session.startTransaction();

    const bulk = nodes.map((n, index) => ({
      updateOne: {
        filter: {
          _id: n.node_id,
          flow_id,
          account_id: req.user.account_id
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

    await updateStartNode(flow_id, req.user.account_id, session);

    await session.commitTransaction();

    res.json({ message: "Orden actualizado correctamente" });

  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
};


