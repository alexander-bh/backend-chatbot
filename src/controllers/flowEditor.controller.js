const mongoose = require("mongoose");
const Flow = require("../models/Flow");
const FlowNode = require("../models/FlowNode");

exports.getFlowEditorData = async (req, res) => {
  try {
    const { flowId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(flowId)) {
      return res.status(400).json({ message: "flowId inválido" });
    }

    const flow = await Flow.findOne({
      _id: flowId,
      account_id: req.user.account_id
    }).lean();

    if (!flow) {
      return res.status(404).json({ message: "Flow no encontrado" });
    }

    const nodes = await FlowNode.find({
      flow_id: flowId,
      account_id: req.user.account_id
    })
      .sort({ parent_node_id: 1, order: 1 })
      .lean();

    res.json({
      flow,
      nodes,
      permissions: {
        can_edit: !flow.is_active
      }
    });

  } catch (error) {
    console.error("getFlowEditorData:", error);
    res.status(500).json({ message: "Error al cargar el editor" });
  }
};
