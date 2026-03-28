const mongoose = require("mongoose");
const Ticket = require("../models/Ticket");
const User = require("../models/User");
const { sendToAccount, sendToAdmin } = require("../services/pusher.service");
const { createAndEmitNotification } = require("../controllers/notification.controller")
const { deleteFromCloudinary } = require("../services/cloudinary.service");
const { CATEGORY_LABELS, PRIORITY_LABELS } = require("../shared/ticket.enums")
const formatDateAMPM = require("../utils/formatDate");
const getTransporter = require("../helper/getTransporter");
const getSupportConfig = require("../helper/getSupportConfig");

/* ─────────────────────────────────────
   CLIENT — CREAR TICKET
───────────────────────────────────── */
exports.createTicket = async (req, res) => {
    try {
        const { ticketId, subject, category, priority, description, channel } =
            req.body;

        if (!ticketId || !subject || !category || !description || !channel) {
            return res.status(400).json({ message: "Datos incompletos" });
        }

        let screenshot_url = null;
        let screenshot_public_id = null;

        if (req.file) {
            screenshot_url = req.file.path;
            screenshot_public_id = req.file.filename;
        }

        const ticket = await Ticket.create({
            ticket_id: ticketId,
            subject: subject.trim(),
            category,
            priority: priority || "media",
            description: description.trim(),
            channel,
            status: "abierto",
            screenshot_url,
            screenshot_public_id,
            user_id: new mongoose.Types.ObjectId(req.user.id),
            account_id: new mongoose.Types.ObjectId(req.user.account_id),
        });

        const user = await User.findById(req.user._id)
            .select("name email")
            .lean()
            .catch(() => null);

        /* ────── NOTIFICACIÓN REALTIME AL ADMIN ────── */
        try {
            // 1. Guardar notificación en BD para que persista en el panel admin
            const notification = await createAndEmitNotification({
                account_id: "admin",
                role: "ADMIN",
                type: "new-ticket",
                title: "Nuevo ticket de soporte",
                body: `${user?.name ?? "Usuario"} abrió: ${ticket.subject}`,
                message: `${user?.name ?? "Usuario"} abrió: ${ticket.subject}`,
                metadata: {
                    ticket_id: ticket.ticket_id,
                    category: CATEGORY_LABELS[ticket.category] || ticket.category,
                    priority: PRIORITY_LABELS[ticket.priority] || ticket.priority,
                    channel: ticket.channel,
                    user: { id: req.user._id, name: user?.name, email: user?.email },
                },
                is_read: false,
            })

            // 2. Emitir al canal privado del admin en tiempo real
            await sendToAdmin("new-ticket", {
                notification_id: notification._id,
                ticket_id: ticket.ticket_id,
                subject: ticket.subject,
                category: CATEGORY_LABELS[ticket.category] || ticket.category,
                priority: PRIORITY_LABELS[ticket.priority] || ticket.priority,
                channel: ticket.channel,
                created_at: ticket.created_at,
                user: {
                    id: req.user._id,
                    name: user?.name,
                    email: user?.email,
                },
            });
        } catch (pusherErr) {
            console.error("Pusher/Notification error (ticket):", pusherErr.message);
        }

        /* ────── NOTIFICACIÓN EMAIL AL ADMIN ────── */
        const { support_email } = await getSupportConfig();

        if (support_email) {
            try {
                const transporter = getTransporter();
                await transporter.sendMail({
                    from: `"Soporte App" <${process.env.SMTP_USER}>`,
                    to: support_email,
                    subject: `[${ticket.ticket_id}] Nuevo ticket: ${ticket.subject}`,
                    html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 24px;
                        border: 1px solid #e2e8f0; border-radius: 8px;">
              <h2 style="color: #10b981; margin-bottom: 4px;">📩 Nuevo Ticket de Soporte</h2>
              <p style="color: #64748b; margin-top: 0;">
                Generado el ${new Date().toLocaleString("es-MX")}
              </p>
              <hr style="border: none; border-top: 1px solid #e2e8f0;" />

              <table style="width:100%; border-collapse: collapse; font-size: 14px; margin-top: 16px;">
                <tr>
                  <td style="padding: 6px 0; color:#64748b; width:120px;"><b>Ticket ID</b></td>
                  <td style="font-family: monospace; color:#10b981;">${ticket.ticket_id}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color:#64748b;"><b>Categoría</b></td>
                  <td>${CATEGORY_LABELS[ticket.category] || ticket.category}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color:#64748b;"><b>Prioridad</b></td>
                  <td>${PRIORITY_LABELS[ticket.priority] || ticket.priority}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color:#64748b;"><b>Canal</b></td>
                  <td>${ticket.channel}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color:#64748b;"><b>Usuario</b></td>
                  <td>${user?.name ?? "—"} (${user?.email ?? "—"})</td>
                </tr>
              </table>

              <div style="margin-top: 16px; background: #f8fafc; border-radius: 6px; padding: 12px;">
                <p style="margin: 0 0 6px; color:#64748b; font-size:13px;"><b>Asunto</b></p>
                <p style="margin: 0; font-size: 15px;">${ticket.subject}</p>
              </div>

              <div style="margin-top: 12px; background: #f8fafc; border-radius: 6px; padding: 12px;">
                <p style="margin: 0 0 6px; color:#64748b; font-size:13px;"><b>Descripción</b></p>
                <p style="margin: 0; font-size: 14px; line-height: 1.6;">${ticket.description}</p>
              </div>

              ${screenshot_url
                            ? `<div style="margin-top:12px;">
                     <p style="color:#64748b;font-size:13px;"><b>Captura adjunta:</b></p>
                     <img src="${screenshot_url}" style="max-width:100%;border-radius:6px;" />
                   </div>`
                            : ""}

              <hr style="border: none; border-top: 1px solid #e2e8f0; margin-top: 24px;" />
              <p style="color:#94a3b8; font-size: 12px; text-align: center;">
                Este correo fue generado automáticamente.
              </p>
            </div>
          `,
                });
            } catch (mailErr) {
                console.error("Email error (ticket):", mailErr.message);
            }
        }

        res.status(201).json({
            message: "Ticket enviado correctamente",
            ticket_id: ticket.ticket_id,
        });
    } catch (err) {
        console.error("CREATE TICKET ERROR:", err);
        res.status(500).json({ message: err.message });
    }
};

/* ─────────────────────────────────────
   CLIENT — MIS TICKETS
───────────────────────────────────── */
exports.getMyTickets = async (req, res) => {
    try {
        const tickets = await Ticket.find({ user_id: req.user.id })
            .sort({ created_at: -1 })
            .lean();

        const formatted = tickets.map((t) => ({
            ...t,
            created_at_formatted: formatDateAMPM(t.created_at),
        }));

        res.json(formatted);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

/* ─────────────────────────────────────
   ADMIN — TODOS LOS TICKETS
───────────────────────────────────── */
exports.getAllTickets = async (req, res) => {
    try {
        const {
            status,
            category,
            priority,
            from,
            to,
            search,
            page = 1,
            limit = 50,
        } = req.query;

        const query = {};

        if (status) query.status = status;
        if (category) query.category = category;
        if (priority) query.priority = priority;

        if (from || to) {
            query.created_at = {};
            if (from) query.created_at.$gte = new Date(from);
            if (to) query.created_at.$lte = new Date(to);
        }

        if (search) {
            query.$or = [
                { subject: { $regex: search, $options: "i" } },
                { ticket_id: { $regex: search, $options: "i" } },
                { description: { $regex: search, $options: "i" } },
            ];
        }

        const safeLimit = Math.min(Number(limit), 100);
        const skip = (Number(page) - 1) * safeLimit;

        const [tickets, total] = await Promise.all([
            Ticket.find(query)
                .populate("user_id", "name email")
                .populate("account_id", "name")
                .sort({ created_at: -1 })
                .skip(skip)
                .limit(safeLimit)
                .lean(),
            Ticket.countDocuments(query),
        ]);

        const formatted = tickets.map((t) => ({
            ...t,
            created_at_formatted: formatDateAMPM(t.created_at),
        }));

        res.json({
            data: formatted,
            meta: {
                total,
                page: Number(page),
                limit: safeLimit,
                pages: Math.ceil(total / safeLimit),
            },
        });
    } catch (err) {
        console.error("GET ALL TICKETS ERROR:", err);
        res.status(500).json({ message: err.message });
    }
};

/* ─────────────────────────────────────
   ADMIN — DETALLE DE TICKET
───────────────────────────────────── */
exports.getTicketDetail = async (req, res) => {
    try {
        const ticket = await Ticket.findById(req.params.id)
            .populate("user_id", "name email")
            .populate("account_id", "name")
            .lean();

        if (!ticket) {
            return res.status(404).json({ message: "Ticket no encontrado" });
        }

        res.json({
            ...ticket,
            created_at_formatted: formatDateAMPM(ticket.created_at),
        });
    } catch (err) {
        const status = err.name === "CastError" ? 400 : 500;
        res.status(status).json({ message: err.message });
    }
};

/* ─────────────────────────────────────
   ADMIN — CAMBIAR ESTADO / NOTAS
───────────────────────────────────── */
exports.updateTicket = async (req, res) => {
    try {
        const { status, admin_notes } = req.body;

        const allowed = ["abierto", "en revisión", "resuelto"];
        if (status && !allowed.includes(status)) {
            return res.status(400).json({ message: "Estado inválido" });
        }

        const ticket = await Ticket.findById(req.params.id);
        if (!ticket) {
            return res.status(404).json({ message: "Ticket no encontrado" });
        }

        if (status) {
            ticket.status = status;
            ticket.resolved_at = status === "resuelto" ? new Date() : null;
        }

        if (admin_notes !== undefined) {
            ticket.admin_notes = admin_notes;
        }

        await ticket.save();

        /* ── notificar al usuario dueño del ticket ── */

        try {
            await createAndEmitNotification({
                account_id: ticket.account_id,
                type: "ticket-updated",
                title: "Tu ticket fue actualizado",
                body: `El estado de tu ticket ${ticket.ticket_id} cambió a: ${ticket.status}`,
                metadata: { ticket_id: ticket.ticket_id, status: ticket.status },
            });
            await sendToAccount(String(ticket.account_id), "ticket-updated", {
                ticket_id: ticket.ticket_id,
                status: ticket.status,
            });
        } catch (e) {
            console.error("Pusher error (ticket-updated):", e.message);
        }

        res.json({ message: "Ticket actualizado", ticket });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

/* ─────────────────────────────────────
   ADMIN — ELIMINAR TICKET
───────────────────────────────────── */
exports.deleteTicket = async (req, res) => {
    try {
        const ticket = await Ticket.findById(req.params.id);
        if (!ticket) {
            return res.status(404).json({ message: "Ticket no encontrado" });
        }

        if (ticket.screenshot_public_id) {
            try {
                await deleteFromCloudinary(ticket.screenshot_public_id);
            } catch (e) {
                console.error("Cloudinary delete error:", e.message);
            }
        }

        await Ticket.deleteOne({ _id: ticket._id });

        res.json({ message: "Ticket eliminado correctamente" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

/* ─────────────────────────────────────
   ADMIN — STATS RÁPIDAS
───────────────────────────────────── */
exports.getTicketStats = async (req, res) => {
    try {
        const [total, abiertos, enRevision, resueltos] = await Promise.all([
            Ticket.countDocuments(),
            Ticket.countDocuments({ status: "abierto" }),
            Ticket.countDocuments({ status: "en revisión" }),
            Ticket.countDocuments({ status: "resuelto" }),
        ]);

        res.json({ total, abiertos, enRevision, resueltos });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};