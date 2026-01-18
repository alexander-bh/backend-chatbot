const User = require("../models/User");
const mongoose = require("mongoose");

// PERFIL DEL USUARIO AUTENTICADO
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// OBTENER TODOS LOS USUARIOS
exports.getUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// OBTENER USUARIO POR ID (con validación)
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

// CREAR USUARIO
exports.createUser = async (req, res) => {
  try {
    const user = await User.create(req.body);
    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// ACTUALIZAR USUARIO
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

// ELIMINAR USUARIO
exports.deleteUser = async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: "Usuario eliminado" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
