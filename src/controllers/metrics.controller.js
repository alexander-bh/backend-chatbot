const mongoose = require("mongoose");
const Contact = require("../models/Contact");
const FlowNode = require("../models/FlowNode");
const Chatbot = require("../models/Chatbot");

/* =========================
   MÉTRICAS GENERALES
========================= */
exports.getChatbotMetrics = async (req, res) => {
  try {
    const { chatbot_id } = req.params;

    const chatbotObjectId = new mongoose.Types.ObjectId(chatbot_id);

    const metrics = await Contact.aggregate([
      { $match: { chatbot_id: chatbotObjectId } },

      {
        $facet: {

          /* Totales */
          totals: [
            {
              $group: {
                _id: null,
                total_contacts: { $sum: 1 },
                completed: {
                  $sum: { $cond: ["$completed", 1, 0] }
                }
              }
            }
          ],

          /* Status breakdown */
          status_breakdown: [
            {
              $group: {
                _id: "$status",
                count: { $sum: 1 }
              }
            }
          ],

          /* Leads hoy */
          today: [
            {
              $match: {
                created_at: {
                  $gte: new Date(new Date().setHours(0, 0, 0, 0))
                }
              }
            },
            { $count: "today_count" }
          ]
        }
      }
    ]);

    const result = metrics[0];

    const totalContacts = result.totals[0]?.total_contacts || 0;
    const completed = result.totals[0]?.completed || 0;

    res.json({
      total_contacts: totalContacts,
      completed,
      conversion_rate: totalContacts
        ? ((completed / totalContacts) * 100).toFixed(2)
        : 0,
      status_breakdown: result.status_breakdown,
      today: result.today[0]?.today_count || 0
    });

  } catch (err) {
    console.error("METRICS ERROR:", err);
    res.status(500).json({ message: "Error obteniendo métricas" });
  }
};

exports.getNodeFunnel = async (req, res) => {
  try {
    const { chatbot_id } = req.params;
    const accountId = req.user.account_id;

    if (!mongoose.Types.ObjectId.isValid(chatbot_id)) {
      return res.status(400).json({ message: "chatbot_id inválido" });
    }

    const chatbotObjectId = new mongoose.Types.ObjectId(chatbot_id);

    /* =============================
       1️⃣ OBTENER CHATBOT + FLOW
    ============================= */

    const chatbot = await Chatbot.findOne({
      _id: chatbotObjectId,
      account_id: accountId
    }).lean();

    if (!chatbot?.flow_id) {
      return res.status(400).json({
        message: "Chatbot sin flow asociado"
      });
    }

    /* =============================
       2️⃣ FUNNEL (usuarios únicos)
    ============================= */

    const funnelRaw = await Contact.aggregate([
      {
        $match: {
          chatbot_id: chatbotObjectId,
          account_id: new mongoose.Types.ObjectId(accountId)
        }
      },

      { $unwind: "$conversation" },

      // 👉 una vez por sesión y nodo
      {
        $group: {
          _id: {
            node_id: "$conversation.node_id",
            session_id: "$session_id"
          }
        }
      },

      // 👉 total por nodo
      {
        $group: {
          _id: "$_id.node_id",
          total: { $sum: 1 }
        }
      },

      { $sort: { total: -1 } }
    ]);

    if (!funnelRaw.length) {
      return res.json({
        chatbot_id,
        total_nodes: 0,
        funnel: []
      });
    }

    /* =============================
       3️⃣ OBTENER NODOS DEL FLOW
    ============================= */

    const nodeIds = funnelRaw.map(f => f._id);

    const nodes = await FlowNode.find({
      _id: { $in: nodeIds },
      flow_id: chatbot.flow_id
    }).lean();

    const nodeMap = new Map(
      nodes.map(n => [String(n._id), n])
    );

    /* =============================
       4️⃣ ENRIQUECER RESPUESTA
    ============================= */

    const enriched = funnelRaw.map(f => {
      const node = nodeMap.get(String(f._id));

      return {
        node_id: f._id,
        total: f.total,
        node_type: node?.node_type || null,
        question: node?.content || null,
        position: node?.position ?? null
      };
    });

    // (opcional) ordenar por posición real del flujo
    enriched.sort(
      (a, b) => (a.position ?? 999) - (b.position ?? 999)
    );

    /* =============================
       5️⃣ RESPONSE
    ============================= */

    res.json({
      chatbot_id,
      flow_id: chatbot.flow_id,
      total_nodes: enriched.length,
      funnel: enriched
    });

  } catch (error) {
    console.error("FUNNEL ERROR:", error);
    res.status(500).json({
      message: "Error obteniendo funnel"
    });
  }
};