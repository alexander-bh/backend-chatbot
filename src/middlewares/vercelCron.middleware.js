module.exports = (req, res, next) => {

  if (req.headers["x-vercel-cron"] !== "1") {
    return res.status(401).json({ message: "Unauthorized cron access" });
  }

  if (req.headers["x-cron-secret"] !== process.env.CRON_SECRET) {
    return res.status(401).json({ message: "Invalid cron secret" });
  }

  next();
};