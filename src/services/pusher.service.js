// services/pusher.service.js
const Pusher = require("pusher");

const pusher = new Pusher({
  appId:   process.env.PUSHER_APP_ID,
  key:     process.env.PUSHER_KEY,
  secret:  process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER,
  useTLS:  true
});

/**
 * Emite un evento a un canal privado de cuenta
 * Canal: private-account-{accountId}
 */
const sendToAccount = (accountId, event, data) => {
  const channel = `private-account-${accountId}`;
  return pusher.trigger(channel, event, data);
};

module.exports = { pusher, sendToAccount };