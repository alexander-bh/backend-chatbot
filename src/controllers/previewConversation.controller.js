const conversationEngine = require("../engine/conversationEngine");
const renderNode = require("../utils/renderNode");

const sessions = new Map(); // 🔥 memoria RAM

exports.startPreview = async (req, res) => {
  try {
    const { nodes, start_node_id } = req.body;

    if (!Array.isArray(nodes) || !nodes.length) {
      return res.status(400).json({ message: "Nodes requeridos" });
    }

    const sessionId = crypto.randomUUID();

    sessions.set(sessionId, {
      nodes,
      startNodeId: start_node_id,
      currentNodeId: start_node_id,
      variables: {}
    });

    const startNode = nodes.find(n => String(n._id) === String(start_node_id));
    if (!startNode) {
      return res.status(400).json({ message: "Start node inválido" });
    }

    return res.json(renderNode(startNode, sessionId));

  } catch (err) {
    console.error("startPreview:", err);
    res.status(500).json({ message: "Error en preview" });
  }
};

exports.nextPreviewStep = async (req, res) => {
  try {
    const { session_id } = req.params;
    const { input } = req.body;

    const session = sessions.get(session_id);
    if (!session) {
      return res.json({ completed: true });
    }

    const result = conversationEngine({
      nodes: session.nodes,
      startNodeId: session.startNodeId,
      currentNodeId: session.currentNodeId,
      input,
      mode: "preview",
      variables: session.variables
    });

    session.currentNodeId = result.nextNode?._id;
    session.variables = result.variables;

    if (!result.nextNode) {
      sessions.delete(session_id);
      return res.json({ completed: true });
    }

    return res.json(renderNode(result.nextNode, session_id));

  } catch (err) {
    console.error("nextPreviewStep:", err);
    res.status(500).json({ message: "Error en preview" });
  }
};
