const router = require("express").Router();
const uploadMedia = require("../middlewares/uploadMedia");
const chatbotController = require("../controllers/multimedia.controller")
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");

router.use(auth);
router.use(role("ADMIN","CLIENT"));

router.post(
  "/node",
  uploadMedia.single("media"),
  chatbotController.saveMediaNode
);

module.exports = router;