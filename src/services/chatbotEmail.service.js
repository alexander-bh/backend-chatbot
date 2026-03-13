const transporter = require("./mailer.service");
const Chatbot = require("../models/Chatbot");

exports.sendConversationEmail = async (session) => {

  try {

    const chatbot = await Chatbot.findById(session.chatbot_id);

    if (!chatbot?.email_settings?.to_email) return;

    const historyHtml = session.history
      .map(h => `
        <p>
          <b>${h.question}</b><br/>
          ${h.answer}
        </p>
      `)
      .join("");

    const htmlContent = `
      <h2>Nueva conversación del chatbot</h2>

      <p><b>Chatbot:</b> ${chatbot.name}</p>
      <p><b>Origen:</b> ${session.origin_url}</p>
      <p><b>Fecha:</b> ${new Date().toLocaleString()}</p>
      <hr/>

      ${historyHtml}
    `;

    const mailOptions = {
      from: `"${chatbot.email_settings.from_name}" <${chatbot.email_settings.from_email || process.env.SMTP_USER}>`,
      to: chatbot.email_settings.to_email,
      subject: `Nueva conversación - ${chatbot.name}`,
      html: htmlContent
    };

    await transporter.sendMail(mailOptions);

    console.log("📧 Email enviado");

  } catch (err) {

    console.error("❌ Error enviando email:", err);

  }

};
