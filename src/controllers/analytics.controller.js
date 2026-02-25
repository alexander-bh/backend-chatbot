// controllers/analytics.controller.js
const mongoose = require("mongoose");
const ConversationSession = require("../models/ConversationSession");
const FlowNode = require("../models/FlowNode");

exports.getFlowDropOff = async (req, res) => {
  try {
    const { id: flowId } = req.params;
    const accountId = req.user.account_id;

    if (!mongoose.Types.ObjectId.isValid(flowId)) {
      return res.status(400).json({ message: "flowId inválido" });
    }

    const metrics = await ConversationSession.aggregate([
      {
        $match: {
          flow_id: new mongoose.Types.ObjectId(flowId),
          account_id: new mongoose.Types.ObjectId(accountId),
          mode: "production",
          history: { $exists: true, $ne: [] }
        }
      },

      {
        $addFields: {
          last_step: { $arrayElemAt: ["$history", -1] }
        }
      },

      {
        $facet: {

          // 🔹 VISITAS ÚNICAS POR SESIÓN
          visits: [
            { $unwind: "$history" },
            {
              $group: {
                _id: {
                  session: "$_id",
                  node: "$history.node_id"
                }
              }
            },
            {
              $group: {
                _id: "$_id.node",
                total_visits: { $sum: 1 }
              }
            }
          ],

          // 🔹 ABANDONOS
          abandons: [
            { $match: { is_completed: false } },
            {
              $group: {
                _id: "$last_step.node_id",
                abandons: { $sum: 1 }
              }
            }
          ]
        }
      },

      {
        $project: {
          combined: {
            $map: {
              input: "$visits",
              as: "visit",
              in: {
                node_id: "$$visit._id",
                total_visits: "$$visit.total_visits",
                abandons: {
                  $let: {
                    vars: {
                      match: {
                        $arrayElemAt: [
                          {
                            $filter: {
                              input: "$abandons",
                              as: "ab",
                              cond: { $eq: ["$$ab._id", "$$visit._id"] }
                            }
                          },
                          0
                        ]
                      }
                    },
                    in: { $ifNull: ["$$match.abandons", 0] }
                  }
                }
              }
            }
          }
        }
      },

      { $unwind: "$combined" },
      { $replaceRoot: { newRoot: "$combined" } },

      {
        $addFields: {
          abandon_rate: {
            $cond: [
              { $eq: ["$total_visits", 0] },
              0,
              {
                $round: [
                  {
                    $multiply: [
                      { $divide: ["$abandons", "$total_visits"] },
                      100
                    ]
                  },
                  2
                ]
              }
            ]
          }
        }
      },

      { $sort: { abandon_rate: -1 } }
    ]);

    /* ---------------------------------------------
       Opcional: Enriquecer con información del nodo
    --------------------------------------------- */

    const nodes = await FlowNode.find({
      flow_id: flowId,
      account_id: accountId
    }).lean();

    const nodeMap = new Map(nodes.map(n => [String(n._id), n]));

    const enriched = metrics.map(m => {
      const node = nodeMap.get(String(m.node_id));

      return {
        node_id: m.node_id,
        node_type: node?.node_type || null,
        question: node?.content || null,
        total_visits: m.total_visits,
        abandons: m.abandons,
        abandon_rate: m.abandon_rate
      };
    });

    return res.json({
      flow_id: flowId,
      total_nodes: enriched.length,
      metrics: enriched
    });

  } catch (error) {
    console.error("getFlowDropOff:", error);
    return res.status(500).json({
      message: "Error obteniendo métricas"
    });
  }
};