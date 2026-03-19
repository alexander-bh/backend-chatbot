const app = require("../src/app");

module.exports = (req, res) => {
  if (req.path.startsWith("/api/cron")) {
    return res.status(404).end();
  }

  return app(req, res);
};