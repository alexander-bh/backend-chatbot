const mongoose = require("mongoose");

let isConnected = false;

module.exports = async function connectDB() {
  if (isConnected) return;

  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI no definida");
    }

    await mongoose.connect(process.env.MONGO_URI);
    isConnected = true;
    console.log("MongoDB conectado");
  } catch (error) {
    console.error("ERROR CONEXIÓN MONGO:", error.message);
    throw error;
  }
};