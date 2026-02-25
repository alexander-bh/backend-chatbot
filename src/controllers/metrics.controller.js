const Contact = require("../models/Contact");
const mongoose = require("mongoose");

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

    const chatbotObjectId = new mongoose.Types.ObjectId(chatbot_id);

    const funnel = await Contact.aggregate([
      { $match: { chatbot_id: chatbotObjectId } },

      { $unwind: "$conversation" },

      {
        $group: {
          _id: "$conversation.node_id",
          count: { $sum: 1 }
        }
      },

      { $sort: { count: -1 } }
    ]);

    res.json(funnel);

  } catch (err) {
    console.error("FUNNEL ERROR:", err);
    res.status(500).json({ message: "Error obteniendo funnel" });
  }
};