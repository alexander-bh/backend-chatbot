// services/pusher.service.js
const Pusher = require("pusher");

const pusher = new Pusher({
  appId:   process.env.PUSHER_APP_ID,
  key:     process.env.PUSHER_KEY,
  secret:  process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER,
  useTLS:  true
});

// Canal privado por cuenta  →  private-account-{accountId}
const sendToAccount = (accountId, event, data) => {
  const channel = `private-account-${accountId}`;
  return pusher.trigger(channel, event, data);
};

// Canal exclusivo del admin  →  private-admin
const sendToAdmin = (event, data) => {
  return pusher.trigger("private-admin", event, data);
};

module.exports = { pusher, sendToAccount, sendToAdmin };