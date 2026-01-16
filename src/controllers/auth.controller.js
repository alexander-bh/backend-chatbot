const User = require("../models/User");
const connectDB = require("../config/database");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// Registro
exports.register = async (req, res) => {
  try {
    await connectDB();

    const { email, password, role, account_id } = req.body;

    if (!email || !password || !role || !account_id) {
      return res.status(400).json({ message: "Datos incompletos" });
    }

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(409).json({ message: "El usuario ya existe" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      email,
      password: hashedPassword,
      role,
      account_id
    });

    res.status(201).json({
      id: user._id,
      email: user.email,
      role: user.role,
      account_id: user.account_id
    });
  } catch (error) {
    console.error("REGISTER ERROR:", error);
    res.status(500).json({ error: error.message });
  }
};

// Login
exports.login = async (req, res) => {
  try {
    await connectDB();

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Datos incompletos" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET no definido");
    }

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
        account_id: user.account_id
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({ token });
  } catch (error) {
    console.error("LOGIN ERROR:", error);
    res.status(500).json({ error: error.message });
  }
};
