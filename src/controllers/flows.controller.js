const mongoose = require("mongoose");
const FlowNode = require("../models/FlowNode");
const { acquireFlowLock } = require("../utils/flowLock.engine");
const { validateFlow } = require("../validators/flow.validator");
const { ensureFlowExists } = require("../services/flowNode.service");
const withTransactionRetry = require("../utils/withTransactionRetry");
const flowNodeService = require("../services/flowNode.service");
const { deleteFromCloudinary } = require("../services/cloudinary.service");

// Obtener nodos por flow
exports.getNodesByFlow = async (req, res) => {
  try {

    console.log("ENTRO A GET NODES");

    const flowId = req.params?.flowId || null;

    const nodes = await flowNodeService.getNodesByFlow(
      flowId,
      req.user
    );

    res.json(nodes || []);

  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
};

// Guardar los flow
exports.saveFlow = async (req, res) => {
  try {
    let flowId = req.params.id;

    if (!flowId || flowId === "null" || flowId === "undefined") {
      flowId = null;
    }

    const {
      nodes = [],
      branches = [],
      start_node_id,
      publish = false,
      chatbot_id
    } = req.body;

    const account_id = req.user.account_id;
    const user_id = req.user._id || req.user.id;

    /* ================= VALIDACIONES BÁSICAS ================= */

    const isValidFlowId =
      flowId && mongoose.Types.ObjectId.isValid(flowId);

    if (flowId && !isValidFlowId) {
      throw new Error("flowId inválido");
    }

    if (!Array.isArray(nodes) || nodes.length === 0) {
      throw new Error("nodes requeridos");
    }

    if (!start_node_id) {
      throw new Error("start_node_id requerido");
    }

    const isPublishing = publish === true;

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

      const flow = await ensureFlowExists({
        flowId: isValidFlowId ? flowId : null,
        chatbot_id,
        account_id,
        user_role: req.user.role,
        session
      });

      await acquireFlowLock({
        flow_id: flow._id,
        user_id,
        account_id,
        session
      });

      /* ================= VALIDACIÓN CHATBOT ================= */

      if (!flow.is_template && isPublishing) {
        if (!chatbot_id || !mongoose.Types.ObjectId.isValid(chatbot_id)) {
          throw new Error("chatbot_id inválido o requerido para publicar");
        }
      }

      const oldNodes = await FlowNode.find(
        {
          flow_id: flow._id,
          ...(flow.is_template ? {} : { account_id })
        },
        { media: 1 },
        { session }
      );

      // Mapa de media que se conservará
      const newMediaKeys = new Set();

      // Recorrer nodos y agregar las media existentes que se mantienen
      allNodes.forEach(node => {
        if (node.node_type !== "media") return;
        (node.media ?? []).forEach((m, i) => {
          // Si es media existente (no se sube) → conservar
          if (m.source !== "upload" && m.public_id) {
            newMediaKeys.add(m.public_id);
          }
        });
      });

      // Recorremos nodos antiguos
      for (const oldNode of oldNodes) {
        if (!oldNode.media || !Array.isArray(oldNode.media)) continue;

        for (const m of oldNode.media) {
          if (!m.public_id) continue;

          // Si el media antiguo NO está en la lista de la nueva flow → eliminar
          if (!newMediaKeys.has(m.public_id)) {
            try {
              await deleteFromCloudinary(m.public_id);
            } catch (err) {
              console.log("Cloudinary delete error:", err.message);
            }
          }
        }
      }

      /* ===== ELIMINAR MEDIA DE CLOUDINARY ===== */
      const uploadedFilesMap = {};
      if (req.files && req.files.length) {
        for (const file of req.files) {
          // El frontend manda file_key = media_<nodeId>_<i>
          uploadedFilesMap[file.fieldname] = {
            url: file.path,       // URL en Cloudinary
            public_id: file.filename,
            type: file.mimetype.startsWith("video/") ? "video" : "image",
            title: file.originalname,
            description: "",
          };
        }
      }

      /* ===== BORRAR NODOS ANTERIORES ===== */

      await FlowNode.deleteMany(
        {
          flow_id: flow._id,
          ...(flow.is_template ? {} : { account_id })
        },
        { session }
      );

      const INPUT_NODES = [
        "question",
        "email",
        "phone",
        "number"
      ];

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
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

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
            flow_id: flow._id,
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

            base[node.node_type] = (sourceArray ?? []).map(opt => {

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
          }

          /* ===== INPUT NODES ===== */

          if (INPUT_NODES.includes(node.node_type)) {

            let variableKey = node.variable_key?.trim();

            // Si no viene o viene vacío → auto generar
            if (!variableKey) {
              variableKey = `${node.node_type}`;
            }

            base.variable_key = variableKey;
            base.validation = node.validation ?? undefined;
            base.crm_field_key = node.crm_field_key ?? undefined;
          }

          /* ===== LINK ===== */

          if (node.node_type === "link") {
            base.link_actions = node.link_actions ?? undefined;
          }

          /* ===== MEDIA ===== */

          if (node.node_type === "media") {
            base.media = (node.media ?? []).map((m, i) => {
              if (m.source === "upload") {
                const key = `media_${node._id}_${i}`;
                if (uploadedFilesMap[key]) {
                  return { ...uploadedFilesMap[key] };
                }
                return null; // opcional: descartar si no se subió
              }
              return m; // media existente (URL externa)
            }).filter(Boolean); // eliminar null
          }
          docs.push(base);
        });
      }

      await FlowNode.insertMany(docs, { session });

      /* ================= ACTUALIZAR FLOW ================= */

      const newStartNodeId = idMap.get(String(start_node_id));

      if (!newStartNodeId) {
        throw new Error("start_node_id inválido después del mapeo");
      }

      if (!flow.is_template && chatbot_id) {
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
      message: error.message
    });
  }
};
