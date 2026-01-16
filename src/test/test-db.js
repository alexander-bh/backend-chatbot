require("dotenv").config();
const mongoose = require("mongoose");

console.log("URI:", process.env.MONGO_URI);

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB conectado correctamente");
    process.exit(0);
  } catch (error) {
    console.error("Error de conexión:", error.message);
    process.exit(1);
  }
})();
