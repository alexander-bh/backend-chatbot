require("dotenv").config();
const app = require("./app");
const connectDB = require("./config/database");
const transporter = require("./services/mailer.service"); 
connectDB();
transporter.verify((error) => {
    if (error) {
        console.error("❌ SMTP ERROR:", error);
    } else {
        console.log("✅ SMTP listo para enviar emails");
    }
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));