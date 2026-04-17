const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
  pool: true,
  maxConnections: 5,
  maxMessages: 100,

  connectionTimeout: 3000, // era 5000
  greetingTimeout:   3000, // era 5000
  socketTimeout:     8000, // era 10000
});
transporter.verify((err) => {
  if (err) console.error("SMTP no disponible:", err.message);
  else console.log("SMTP listo");
});

module.exports = transporter;