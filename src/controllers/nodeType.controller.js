const NodeType = require("../models/NodeType");

/* =========================================
   CREAR NODE TYPE
========================================= */
exports.createNodeType = async (req, res) => {
  try {
    const {
      key,
      label,
      mode,
      answerUser,
      accordions,
      defaults,
      is_active
    } = req.body;

    const nodeType = await NodeType.create({
      account_id: null,
      key,
      label,
      mode: mode ?? "basic",
      answerUser: answerUser ?? false,
      accordions: accordions ?? [],
      defaults: {
        content: defaults?.content ?? "",
        typing_time: defaults?.typing_time ?? 2,
        validation: defaults?.validation,
        options: defaults?.options ?? [],
        link_actions: defaults?.link_actions ?? [],
        variable_key: defaults?.variable_key ?? null,
        media: defaults?.media ?? null
      },
      is_system: true,
      is_active: is_active ?? true
    });

    res.status(201).json({
      success: true,
      data: nodeType
    });

  } catch (error) {
    console.error("createNodeType error:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor"
    });
  }
};

/* =========================================
   EDITAR NODE TYPE
========================================= */
exports.updateNodeType = async (req, res) => {
  try {
    const { id } = req.params;
    const account_id = req.user?.account_id || null;

    const nodeType = await NodeType.findOne({
      _id: id,
      $or: [
        { account_id: null },
        { account_id }
      ]
    });

    if (!nodeType) {
      return res.status(404).json({
        success: false,
        message: "Tipo de nodo no encontrado"
      });
    }

    if (req.body.mode) {
      const allowedModes = ["basic", "advanced"];
      if (!allowedModes.includes(req.body.mode)) {
        return res.status(400).json({
          success: false,
          message: "Modo inválido"
        });
      }
    }

    const allowedFields = [
      "label",
      "mode",
      "answerUser",
      "accordions",
      "defaults",
      "is_active"
    ];

    allowedFields.forEach(field => {
      if (field === "defaults" && req.body.defaults) {
        nodeType.defaults = {
          ...nodeType.defaults.toObject(),
          ...req.body.defaults
        };
      } else if (req.body[field] !== undefined) {
        nodeType[field] = req.body[field];
      }
    });

    await nodeType.save();

    res.json({
      success: true,
      data: nodeType
    });

  } catch (error) {
    console.error("updateNodeType error:", error);
    res.status(500).json({
      success: false,
      message: "Error actualizando tipo de nodo"
    });
  }
};

/* =========================================
   LISTAR NODE TYPES
========================================= */
exports.getNodeTypes = async (req, res) => {
  try {
    const account_id = req.user?.account_id || null;

    let filter = { is_active: true };

    filter.$or = [
      { account_id: null },
      { account_id }
    ];

    const nodeTypes = await NodeType.find(filter).sort({ createdAt: 1 });

    res.json({
      success: true,
      data: nodeTypes
    });

  } catch (error) {
    console.error("getNodeTypes error:", error);
    res.status(500).json({
      success: false,
      message: "Error obteniendo tipos de nodo"
    });
  }
};

/* =========================================
   ELIMINAR NODE TYPE
========================================= */
exports.deleteNodeType = async (req, res) => {
  try {
    const { id } = req.params;
    const account_id = req.user?.account_id || null;

    const nodeType = await NodeType.findOne({
      _id: id,
      $or: [
        { account_id: null },
        { account_id }
      ]
    });

    if (!nodeType) {
      return res.status(404).json({
        success: false,
        message: "Tipo de nodo no encontrado"
      });
    }
    await nodeType.deleteOne();

    res.json({
      success: true,
      message: "Tipo de nodo eliminado"
    });

  } catch (error) {
    console.error("deleteNodeType error:", error);
    res.status(500).json({
      success: false,
      message: "Error eliminando tipo de nodo"
    });
  }
};