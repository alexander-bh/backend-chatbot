const mongoose = require("mongoose");
const Flow = require("../models/Flow");
const Chatbot = require("../models/Chatbot");
const FlowNode = require("../models/FlowNode");
const { acquireFlowLock } = require("../utils/flowLock.engine");
const { getEditableFlow } = require("../utils/flow.utils");
const { validateFlow } = require("../validators/flow.validator");
const withTransactionRetry = require("../utils/withTransactionRetry");
const flowNodeService = require("../services/flowNode.service");

//Obtener flow por ID
exports.getFlowById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) { // ✅ FIX
      return res.status(400).json({ message: "ID inválido" });
    }

    const flow = await Flow.findOne({
      _id: id,
      account_id: req.user.account_id
    });

    if (!flow) {
      return res.status(404).json({ message: "Flow no encontrado" });
    }

    const nodes = await FlowNode.find({
      flow_id: id,
      account_id: req.user.account_id
    })
      .sort({ order: 1 })
      .lean();

    res.json({ flow, nodes });

  } catch (error) {
    console.error("getFlowById:", error);
    res.status(500).json({ message: "Error al obtener flow" });
  }
};

// Obtener flows por chatbot
exports.getFlowsByChatbot = async (req, res) => {
  try {
    const { chatbotId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(chatbotId)) {
      return res.status(400).json({ message: "chatbotId inválido" });
    }

    const chatbot = await Chatbot.findOne({
      _id: chatbotId,
      account_id: req.user.account_id
    });

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    const flows = await Flow.find({
      chatbot_id: chatbot._id,
      account_id: req.user.account_id
    });

    res.json(flows);

  } catch (error) {
    console.error("getFlowsByChatbot:", error);
    res.status(500).json({ message: error.message });
  }
};

// Obtener nodos por flow
// controllers/flows.controller.js
exports.getNodesByFlow = async (req, res) => {
  try {
    const { flowId } = req.params;

    const nodes = await flowNodeService.getNodesByFlow(
      flowId,
      req.user
    );

    res.json(nodes);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// Crear flow
exports.createFlow = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { chatbot_id, name } = req.body;

    if (!chatbot_id || !name) {
      return res.status(400).json({
        message: "chatbot_id y name son requeridos"
      });
    }

    const chatbot = await Chatbot.findOne({
      _id: chatbot_id,
      account_id: req.user.account_id
    });

    if (!chatbot) {
      return res.status(404).json({
        message: "Chatbot no encontrado"
      });
    }

    session.startTransaction();

    const [flow] = await Flow.create([{
      account_id: req.user.account_id,
      chatbot_id,
      name,
      status: "draft",
      start_node_id: null,
      version: 1
    }], { session });

    const [startNode] = await FlowNode.create([{
      account_id: req.user.account_id,
      flow_id: flow._id,
      order: 0,
      node_type: "text",
      content: "Inicio del flujo",
      next_node_id: null,
      options: []
    }], { session });

    flow.start_node_id = startNode._id;
    await flow.save({ session });

    await session.commitTransaction();

    res.status(201).json(flow);

  } catch (error) {
    await session.abortTransaction();
    console.error("createFlow error:", error);
    res.status(500).json({
      message: "Error creando flow",
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

// Actualizar flow
exports.updateFlow = async (req, res) => {
  try {
    const flow = await getEditableFlow(
      req.params.id,
      req.user.account_id
    );

    flow.name = req.body.name ?? flow.name;
    await flow.save();

    res.json(flow);

  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Eliminar flow
exports.deleteFlow = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const flow = await Flow.findOne({
      _id: req.params.id,
      account_id: req.user.account_id
    }).session(session);

    if (!flow) {
      throw new Error("Flow no encontrado");
    }

    await FlowNode.deleteMany(
      { flow_id: flow._id },
      { session }
    );

    await flow.deleteOne({ session });

    await session.commitTransaction();
    res.json({ message: "Flow eliminado correctamente" });

  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

// Guardar los flow 
exports.saveFlow = async (req, res) => {
  try {
    const flowId = req.params.id;

    const {
      nodes = [],
      branches = [],
      start_node_id,
      publish = false,
      chatbot_id
    } = req.body;

    const account_id = req.user.account_id;
    const user_id = req.user._id || req.user.id;

    /* ================= VALIDACIONES ================= */

    if (!mongoose.Types.ObjectId.isValid(flowId)) {
      throw new Error("flowId inválido");
    }

    if (!Array.isArray(nodes) || nodes.length === 0) {
      throw new Error("nodes requeridos");
    }

    if (!start_node_id) {
      throw new Error("start_node_id requerido");
    }

    /* ================= UNIFICAR NODOS ================= */

    const allNodes = [
      ...nodes.map(n => ({ ...n, branch_id: null })),
      ...branches.flatMap(branch =>
        (branch.nodes || []).map(n => ({
          ...n,
          branch_id: branch.id
        }))
      )
    ];

    /* ================= MAPEO DE IDS ================= */

    const idMap = new Map();
    const validOldIds = new Set();

    allNodes.forEach(n => {
      if (!n._id) throw new Error("Nodo sin _id");

      const oldId = String(n._id);

      if (validOldIds.has(oldId)) {
        throw new Error(`_id duplicado: ${oldId}`);
      }

      validOldIds.add(oldId);
      idMap.set(oldId, new mongoose.Types.ObjectId());
      n.__old_id = oldId;
    });

    if (!validOldIds.has(String(start_node_id))) {
      throw new Error("start_node_id no existe en nodes");
    }

    /* ================= VALIDACIÓN ESTRUCTURAL ================= */

    validateFlow(nodes, branches, start_node_id);

    /* ================= TRANSACCIÓN ================= */

    await withTransactionRetry(async session => {

      await acquireFlowLock({
        flow_id: flowId,
        user_id,
        account_id,
      });

      const flow = await getEditableFlow(
        flowId,
        {
          account_id,
          user_role: req.user.role
        },
        session
      );

      const isPublishing = publish === true;

      if (!flow?.is_template) {
        if (!chatbot_id || !mongoose.Types.ObjectId.isValid(chatbot_id)) {
          throw new Error("chatbot_id inválido o requerido");
        }
      }


      /* ===== BORRAR NODOS ANTERIORES ===== */
      await FlowNode.deleteMany(
        {
          flow_id: flowId,
          ...(flow.is_template ? {} : { account_id })
        },
        { session }
      );

      const INPUT_NODES = ["text_input", "email", "phone", "number"];

      /* ================= AGRUPAR POR RAMA ================= */

      const groupedByBranch = {};

      allNodes.forEach(node => {
        const key = node.branch_id || "__main__";
        if (!groupedByBranch[key]) groupedByBranch[key] = [];
        groupedByBranch[key].push(node);
      });

      const docs = [];

      for (const branchKey in groupedByBranch) {

        const branchNodes = groupedByBranch[branchKey]
          .sort((a, b) => a.order - b.order);

        branchNodes.forEach((node, index) => {

          const oldId = node.__old_id;
          const newId = idMap.get(oldId);

          /* ===== RESOLVER NEXT ===== */

          let nextNodeId = null;

          if (
            node.next_node_id &&
            validOldIds.has(String(node.next_node_id))
          ) {
            nextNodeId = idMap.get(String(node.next_node_id));
          } else {
            const nextNode = branchNodes[index + 1];
            if (nextNode) {
              nextNodeId = idMap.get(nextNode.__old_id);
            }
          }

          const base = {
            _id: newId,
            flow_id: flowId,
            account_id: flow.is_template ? null : account_id,
            branch_id: branchKey === "__main__" ? null : branchKey,
            order: index,
            node_type: node.node_type,
            content: node.content ?? "",
            typing_time: node.typing_time ?? 2,
            next_node_id: nextNodeId,
            end_conversation: node.end_conversation === true,
            meta: node.meta ?? {},
            is_draft: !isPublishing
          };

          /* ===== OPTIONS / POLICY ===== */

          if (node.node_type === "options" || node.node_type === "policy") {

            const sourceArray =
              node.node_type === "options"
                ? node.options
                : node.policy;

            const mappedOptions = (sourceArray ?? []).map(opt => {

              let mappedNextNodeId = null;

              if (
                opt.next_node_id &&
                validOldIds.has(String(opt.next_node_id))
              ) {
                mappedNextNodeId = idMap.get(String(opt.next_node_id));
              }

              return {
                label: opt.label,
                value: opt.value,
                order: opt.order ?? 0,
                next_node_id: mappedNextNodeId,
                next_branch_id: opt.next_branch_id ?? null
              };
            });

            if (node.node_type === "options") {
              base.options = mappedOptions;
            } else {
              base.policy = mappedOptions;
            }
          }

          /* ===== INPUT NODES ===== */

          if (INPUT_NODES.includes(node.node_type)) {

            if (!node.variable_key) {
              throw new Error(
                `Nodo ${node.node_type} requiere variable_key`
              );
            }

            base.variable_key = node.variable_key;
            base.validation = node.validation ?? undefined;
            base.crm_field_key = node.crm_field_key ?? undefined;
          }

          /* ===== LINK ===== */

          if (node.node_type === "link") {
            base.link_actions = node.link_actions ?? undefined;
          }

          docs.push(base);
        });
      }

      await FlowNode.insertMany(docs, { session });

      /* ================= ACTUALIZAR FLOW ================= */

      const newStartNodeId = idMap.get(String(start_node_id));

      if (!newStartNodeId || !mongoose.Types.ObjectId.isValid(newStartNodeId)) {
        throw new Error("start_node_id inválido después del mapeo");
      }

      if (!flow.is_template) {
        flow.chatbot_id = chatbot_id;
      }
      flow.start_node_id = newStartNodeId;
      flow.lock = null;
      flow.status = isPublishing ? "published" : "draft";

      if (isPublishing) {
        flow.version = (flow.version ?? 0) + 1;
        flow.published_at = new Date();
      }

      await flow.save({ session });
    });

    return res.json({
      success: true,
      message: publish
        ? "Flow publicado correctamente"
        : "Flow guardado como borrador"
    });

  } catch (error) {
    console.log("🔥 FULL ERROR:", error);
    console.log("🔥 STACK:", error.stack);

    return res.status(400).json({
      success: false,
      message: error.message,
      stack: error.stack
    });
  }
};
