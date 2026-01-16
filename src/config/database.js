const mongoose = require("mongoose");

let isConnected = false;

module.exports = async function connectDB() {
  if (isConnected) return;

  try {
    await mongoose.connect(process.env.MONGO_URI);
    isConnected = true;
    console.log("MongoDB conectado");
  } catch (error) {
    console.error("Error MongoDB:", error);
    throw error;
  }
};