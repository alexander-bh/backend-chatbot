const User = require("../models/User");
const mongoose = require("mongoose");

// Perfil de usario
exports.getProfile = async (req, res) => {
  try {
    const user = await User
      .findById(req.user.id)
      .select("-password");

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res.json({
      user,
      account_id: req.user.account_id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Obterner los datos de usario 
exports.getUsers = async (req, res) => {
  try {
    const order = req.query.order === "asc" ? 1 : -1;

    const users = await User.find()
      .select("_id name email role created_at")
      .sort({ created_at: order });

    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Obtener los datos de usuario 
exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID inválido" });
    }

    const user = await User.findById(id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Crear usario
exports.createUser = async (req, res) => {
  try {
    const user = await User.create(req.body);
    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Actualizar usuario
exports.updateUser = async (req, res) => {
  try {
    const data = req.body;

    if (
      data.onboarding &&
      !["NEGOCIO", "EQUIPO_COMERCIAL"].includes(
        data.onboarding?.uso_herramienta
      )
    ) {
      delete data.onboarding.situacion_diaria;
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: data },
      { new: true, runValidators: true }
    ).select("-password");

    res.json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Eliminar usuario
exports.deleteUser = async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: "Usuario eliminado" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
