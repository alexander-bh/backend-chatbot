const mongoose = require("mongoose");

let isConnected = false;

const connectDB = async () => {
  if (isConnected) return;

  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI no definida");

  const db = await mongoose.connect(uri, {
    bufferCommands: false,
    dbName: "dbchatbot",
    serverSelectionTimeoutMS: 5000,
  });

  isConnected = db.connections[0].readyState;
  console.log("MongoDB conectado");
};

module.exports = connectDB;

