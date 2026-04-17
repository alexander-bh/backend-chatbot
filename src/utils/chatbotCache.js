const cache = new Map();
const TTL = 5 * 60 * 1000; // 5 minutos

exports.getChatbot = async (id) => {
    const cached = cache.get(id);
    if (cached && Date.now() - cached.ts < TTL) return cached.data;

    const chatbot = await Chatbot.findById(id).lean();
    if (chatbot) cache.set(id, { data: chatbot, ts: Date.now() });
    return chatbot;
};

exports.invalidate = (id) => cache.delete(id);