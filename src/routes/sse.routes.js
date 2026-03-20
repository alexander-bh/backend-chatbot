// routes/sse.routes.js
const router  = require("express").Router();
const auth    = require("../middlewares/auth.middleware");
const sseCtrl = require("../controllers/sse.controller");

router.get("/connect", auth, sseCtrl.connect);

module.exports = router;