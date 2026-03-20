// routes/pusher.routes.js
const router = require("express").Router();
const auth   = require("../middlewares/auth.middleware");
const ctrl   = require("../controllers/pusher.controller");

router.post("/auth", auth, ctrl.auth);

module.exports = router;