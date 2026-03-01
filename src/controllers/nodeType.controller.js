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
      is_system,
      is_active
    } = req.body;

    const account_id = req.user?.account_id || null;

    if (!key || !label) {
      return res.status(400).json({
        success: false,
        message: "key y label son requeridos"
      });
    }

    // 🔥 validar mode
    const allowedModes = ["basic", "advanced"];
    if (mode && !allowedModes.includes(mode)) {
      return res.status(400).json({
        success: false,
        message: "Modo inválido. Solo basic o advanced"
      });
    }

    // evitar duplicados por cuenta
    const exists = await NodeType.findOne({
      key,
      account_id
    });

    if (exists) {
      return res.status(400).json({
        success: false,
        message: "Ya existe un tipo de nodo con esa clave"
      });
    }

    const nodeType = await NodeType.create({
      account_id,
      key,
      label,
      mode: mode ?? "basic",
      answerUser: answerUser ?? false,
      accordions: accordions ?? [],
      defaults: defaults ?? {},
      is_system: is_system ?? false,
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
      message: "Error creando tipo de nodo"
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

    // 🔥 Multi-tenant protection
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

    if (nodeType.is_system) {
      return res.status(403).json({
        success: false,
        message: "No se puede editar un tipo de nodo del sistema"
      });
    }

    // 🔥 validar mode si viene
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
      if (req.body[field] !== undefined) {
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

    const nodeTypes = await NodeType.find({
      $or: [
        { account_id: null },
        { account_id }
      ],
      is_active: true
    }).sort({ createdAt: 1 });

    const grouped = nodeTypes.reduce(
      (acc, type) => {
        const mode = type.mode || "basic";
        acc[mode].push(type);
        return acc;
      },
      { basic: [], advanced: [] }
    );

    res.json({
      success: true,
      data: grouped
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

    if (nodeType.is_system) {
      return res.status(403).json({
        success: false,
        message: "No se puede eliminar un tipo de nodo del sistema"
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