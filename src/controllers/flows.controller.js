const mongoose = require("mongoose");
const FlowNode = require("../models/FlowNode");
const { acquireFlowLock } = require("../utils/flowLock.engine");
const { validateFlow } = require("../validators/flow.validator");
const { ensureFlowExists } = require("../services/flowNode.service");
const withTransactionRetry = require("../utils/withTransactionRetry");
const flowNodeService = require("../services/flowNode.service");
const {
  isValidUrl,
  isMediaUrl,
  getMediaType,
  isYoutubeUrl,
  cleanUrl } = require("../helper/isValidUrl");
const { extractMediaToDelete, groupNodesByBranch, buildUploadedFilesMap } = require("../helper/flow.helpers")
const { deleteMediaBatch } = require("../helper/media.helpers");

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

    const account_id = req.user.account_id;
    const user_id = req.user._id || req.user.id;

    let {
      nodes = [],
      branches = [],
      start_node_id,
      publish = false,
      chatbot_id
    } = req.body;

    /* ================= PARSE FORMDATA ================= */

    if (req.body.data) {
      const parsed = JSON.parse(req.body.data);

      nodes = parsed.nodes ?? [];
      branches = parsed.branches ?? [];
      start_node_id = parsed.start_node_id ?? start_node_id;
      publish = parsed.publish ?? publish;
      chatbot_id = parsed.chatbot_id ?? chatbot_id;
    }

    if (typeof nodes === "string") nodes = JSON.parse(nodes);
    if (typeof branches === "string") branches = JSON.parse(branches);

    if (!nodes.length) throw new Error("nodes requeridos");
    if (!start_node_id) throw new Error("start_node_id requerido");

    console.log("======== FLOW PAYLOAD ========");
    console.log("start_node_id:", start_node_id);
    console.log("nodes length:", nodes.length);
    console.log("branches length:", branches.length);
    console.log("nodes:", JSON.stringify(nodes, null, 2));

    const isPublishing = publish === true;

    /* ================= MEDIA A ELIMINAR ================= */

    const parsedPayload = req.body.data
      ? JSON.parse(req.body.data)
      : req.body;

    const { publicIds, nodeIds } = extractMediaToDelete(parsedPayload);

    let nodeMedia = [];

    if (nodeIds.length) {

      const nodesFound = await FlowNode.find({
        _id: { $in: nodeIds }
      }).select("media");

      for (const node of nodesFound) {
        for (const m of node.media || []) {
          if (m.public_id) {
            nodeMedia.push(m.public_id);
          }
        }
      }

    }

    const mediaToDelete = [
      ...new Set([...publicIds, ...nodeMedia])
    ];

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

    /* ================= MAPEAR IDS ================= */

    const idMap = new Map();
    const validOldIds = new Set();

    for (const n of allNodes) {

      if (!n._id) throw new Error("Nodo sin _id");

      const oldId = String(n._id);

      if (validOldIds.has(oldId)) {
        throw new Error(`_id duplicado: ${oldId}`);
      }

      validOldIds.add(oldId);

      const newId = new mongoose.Types.ObjectId();

      console.log("MAP NODE ID");
      console.log("OLD:", oldId);
      console.log("NEW:", newId.toString());

      idMap.set(oldId, newId);

      n.__old_id = oldId;
    }

    if (!validOldIds.has(String(start_node_id))) {
      throw new Error("start_node_id no existe");
    }

    /* ================= VALIDAR FLOW ================= */

    validateFlow(nodes, branches, start_node_id);

    const uploadedFilesMap = buildUploadedFilesMap(req.files);

    await withTransactionRetry(async session => {

      const flow = await ensureFlowExists({
        flowId,
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

      /* ===== BORRAR NODOS ===== */

      await FlowNode.deleteMany(
        {
          flow_id: flow._id,
          ...(flow.is_template ? {} : { account_id })
        },
        { session }
      );

      /* ================= AGRUPAR POR RAMA ================= */

      const groupedByBranch = groupNodesByBranch(allNodes);

      const docs = [];

      for (const branchKey in groupedByBranch) {

        const branchNodes = groupedByBranch[branchKey]
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

        branchNodes.forEach((node, index) => {
          console.log("----- PROCESS NODE -----");
          console.log("NODE:", node.__old_id);
          console.log("TYPE:", node.node_type);
          console.log("ORDER:", node.order);
          console.log("NEXT SENT FROM FRONT:", node.next_node_id);

          const newId = idMap.get(node.__old_id);

          /* ===== RESOLVER NEXT ===== */

          let nextNodeId = null;

          if (node.next_node_id && validOldIds.has(String(node.next_node_id))) {
            nextNodeId = idMap.get(String(node.next_node_id));

            console.log("NEXT RESOLVED BY ID:", node.next_node_id);
            console.log("NEXT NEW ID:", nextNodeId?.toString());
          } else {
            const next = branchNodes[index + 1];
            if (next) nextNodeId = idMap.get(next.__old_id);
            if (next) {
              nextNodeId = idMap.get(next.__old_id);

              console.log("NEXT AUTO ORDER →", next.__old_id);
            } else {
              console.log("NO NEXT NODE");
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

          /* ================= OPTIONS ================= */

          if (["options", "policy"].includes(node.node_type)) {

            const source = node[node.node_type] ?? [];

            base[node.node_type] = source.map(opt => ({
              label: opt.label,
              value: opt.value,
              order: opt.order ?? 0,
              next_node_id: opt.next_node_id
                ? idMap.get(String(opt.next_node_id))
                : null,
              next_branch_id: opt.next_branch_id ?? null
            }));
          }

          /* ================= INPUT ================= */

          if (["question", "email", "phone", "number"].includes(node.node_type)) {

            base.variable_key =
              node.variable_key?.trim() || node.node_type;

            base.validation = node.validation ?? undefined;
            base.crm_field_key = node.crm_field_key ?? undefined;
          }

          /* ================= LINK ================= */

          if (node.node_type === "link") {
            base.link_actions = node.link_actions ?? undefined;
          }

          /* ================= MEDIA ================= */

          if (node.node_type === "media") {

            base.media = (node.media ?? [])
              .filter(m => !mediaToDelete.includes(m.public_id))
              .map((m, i) => {

                const key = `media_${node._id}_${i}`;

                if (m.public_id) {
                  return {
                    url: cleanUrl(m.url),
                    public_id: m.public_id,
                    type: m.type ?? getMediaType(m.url)
                  };
                }

                // 🆕 Solo subir si es upload REAL (archivo nuevo)
                if (m.source === "upload" && uploadedFilesMap[key]) {
                  return uploadedFilesMap[key];
                }

                if (m.source === "url") {

                  const url = cleanUrl(m.url);

                  if (!isValidUrl(url)) {
                    throw new Error(`URL inválida ${url}`);
                  }

                  if (!isMediaUrl(url) && !isYoutubeUrl(url)) {
                    throw new Error(`La URL no es imagen o video válido`);
                  }

                  return {
                    url,
                    public_id: m.public_id ?? null,
                    type: isYoutubeUrl(url) ? "video" : getMediaType(url)
                  };
                }

                if (m.url) {
                  return {
                    url: cleanUrl(m.url),
                    public_id: m.public_id ?? null,
                    type: m.type ?? getMediaType(m.url)
                  };
                }

                return null;

              })
              .filter(Boolean);
          }
          console.log("NODE TO SAVE:");
          console.log({
            id: newId.toString(),
            node_type: node.node_type,
            next_node_id: nextNodeId?.toString(),
            order: index
          });
          docs.push(base);

        });
      }

      console.log("======= FINAL DOCS =======");
      console.log(
        docs.map(d => ({
          id: d._id.toString(),
          type: d.node_type,
          next: d.next_node_id?.toString(),
          order: d.order
        }))
      );

      await FlowNode.insertMany(docs, { session });

      /* ================= ACTUALIZAR FLOW ================= */

      const newStartNodeId = idMap.get(String(start_node_id));

      flow.start_node_id = newStartNodeId;
      flow.lock = null;
      flow.status = isPublishing ? "published" : "draft";

      if (!flow.is_template && chatbot_id) {
        flow.chatbot_id = chatbot_id;
      }

      if (isPublishing) {
        flow.version = (flow.version ?? 0) + 1;
        flow.published_at = new Date();
      }

      await flow.save({ session });

    });

    /* ================= BORRAR MEDIA ================= */

    if (mediaToDelete.length) {
      await deleteMediaBatch(mediaToDelete);
    }


    return res.json({
      success: true,
      message: publish
        ? "Flow publicado correctamente"
        : "Flow guardado como borrador"
    });

  } catch (error) {

    console.log("🔥 FULL ERROR:", error);

    return res.status(400).json({
      success: false,
      message: error.message
    });

  }
};

