const mongoose = require("mongoose");

let isConnected = false;

module.exports = async function connectDB() {
  if (isConnected) return;

  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI no definida");
  }

  try {
    const db = await mongoose.connect(process.env.MONGO_URI, {
      bufferCommands: false,
    });

    isConnected = db.connections[0].readyState;
    console.log("MongoDB conectado");
  } catch (error) {
    console.error("ERROR CONEXIÓN MONGO:", error);
    throw error;
  }
};
