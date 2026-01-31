const mongoose = require("mongoose");
const User = require("../models/User");
const Account = require("../models/Account");
const Chatbot = require("../models/Chatbot");
const Flow = require("../models/Flow");
const FlowNode = require("../models/FlowNode");

/* ─────────────────────────────────────
   DASHBOARD
───────────────────────────────────── */
exports.getDashboard = async (req, res) => {
    try {
        const admin = await User.findById(req.user.id)
            .select("-password");

        if (!admin || admin.role !== "ADMIN") {
            return res.status(403).json({
                message: "No autorizado"
            });
        }

        const [
            users,
            accounts,
            chatbots,
            flows
        ] = await Promise.all([
            User.countDocuments(),
            Account.countDocuments(),
            Chatbot.countDocuments(),
            Flow.countDocuments()
        ]);

        res.json({
            admin,
            users,
            accounts,
            chatbots,
            flows
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

/* ─────────────────────────────────────
   USERS
───────────────────────────────────── */
exports.getAllUsers = async (req, res) => {
    try {
        const users = await User.find()
            .select("-password")
            .sort({ created_at: -1 });

        res.json(users);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.getUserDetail = async (req, res) => {
    try {
        const user = await User.findById(req.params.id)
            .select("-password");

        if (!user) {
            return res.status(404).json({
                message: "Usuario no encontrado"
            });
        }

        res.json(user);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};

exports.updateAnyUser = async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true, runValidators: true }
        ).select("-password");

        if (!user) {
            return res.status(404).json({
                message: "Usuario no encontrado"
            });
        }

        res.json(user);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};

exports.deleteAnyUser = async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ message: "Usuario eliminado" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

/* ─────────────────────────────────────
   ACCOUNTS
───────────────────────────────────── */
exports.getAllAccounts = async (req, res) => {
    try {
        const accounts = await Account.find()
            .sort({ created_at: -1 });

        res.json(accounts);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

/* ─────────────────────────────────────
   CHATBOTS
───────────────────────────────────── */
exports.getAllChatbots = async (req, res) => {
    try {
        const chatbots = await Chatbot.find()
            .sort({ created_at: -1 });

        res.json(chatbots);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.getChatbotDetail = async (req, res) => {
    try {
        const chatbot = await Chatbot.findById(req.params.id);
        if (!chatbot) {
            return res.status(404).json({
                message: "Chatbot no encontrado"
            });
        }
        res.json(chatbot);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};

exports.deleteAnyChatbot = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const chatbot = await Chatbot.findById(req.params.id)
            .session(session);

        if (!chatbot) {
            throw new Error("Chatbot no encontrado");
        }

        const flows = await Flow.find({
            chatbot_id: chatbot._id
        }).session(session);

        const flowIds = flows.map(f => f._id);

        await FlowNode.deleteMany(
            { flow_id: { $in: flowIds } },
            { session }
        );

        await Flow.deleteMany(
            { chatbot_id: chatbot._id },
            { session }
        );

        await Chatbot.deleteOne(
            { _id: chatbot._id },
            { session }
        );

        await session.commitTransaction();
        res.json({ message: "Chatbot eliminado por admin" });

    } catch (err) {
        await session.abortTransaction();
        res.status(500).json({ message: err.message });
    } finally {
        session.endSession();
    }
};

/* ─────────────────────────────────────
   FLOWS
───────────────────────────────────── */
exports.getFlowsByChatbot = async (req, res) => {
    try {
        const flows = await Flow.find({
            chatbot_id: req.params.chatbotId
        });

        res.json(flows);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.getFlowDetail = async (req, res) => {
    try {
        const flow = await Flow.findById(req.params.id);
        if (!flow) {
            return res.status(404).json({
                message: "Flow no encontrado"
            });
        }

        const nodes = await FlowNode.find({
            flow_id: flow._id
        });

        res.json({ flow, nodes });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

/* ─────────────────────────────────────
   IMPERSONATE (SOPORTE)
───────────────────────────────────── */
exports.impersonateUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({
                message: "Usuario no encontrado"
            });
        }

        res.json({
            message: "Impersonación permitida",
            impersonate: {
                user_id: user._id,
                account_id: user.account_id
            }
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
