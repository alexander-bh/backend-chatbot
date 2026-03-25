// routes/ticket.routes.js
const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const ticketController = require("../controllers/Ticket.controller");
const uploadScreenshot = require("../middlewares/Uploadscreenshot.middleware");

router.use(auth);

/* =========================
   CLIENT
========================= */

// Crear ticket (con screenshot opcional)
router.post(
    "/",
    uploadScreenshot.single("screenshot"),
    ticketController.createTicket
);

// Ver mis tickets
router.get("/me", ticketController.getMyTickets);

/* =========================
   ADMIN
========================= */

// Stats rápidas
router.get("/stats", role("ADMIN"), ticketController.getTicketStats);

// Listar todos con filtros y paginación
router.get("/", role("ADMIN"), ticketController.getAllTickets);

// Detalle
router.get("/:id", role("ADMIN"), ticketController.getTicketDetail);

// Cambiar estado / agregar nota interna
router.put("/:id", role("ADMIN"), ticketController.updateTicket);

// Eliminar
router.delete("/:id", role("ADMIN"), ticketController.deleteTicket);

module.exports = router;