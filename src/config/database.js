const mongoose = require("mongoose");

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = {
    conn: null,
    promise: null
  };
}

const connectDB = async () => {

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {

    const uri = process.env.MONGO_URI;

    if (!uri) {
      throw new Error("MONGO_URI no definida");
    }

    cached.promise = mongoose.connect(uri, {
      bufferCommands: false,
      dbName: "dbchatbot",
      serverSelectionTimeoutMS: 5000
    });

  }

  cached.conn = await cached.promise;

  console.log("MongoDB conectado");

  return cached.conn;

};

module.exports = connectDB;