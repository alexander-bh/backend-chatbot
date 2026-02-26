// controllers/analytics.controller.js
const mongoose = require("mongoose");
const ConversationSession = require("../models/ConversationSession");
const FlowNode = require("../models/FlowNode");
const Contact = require("../models/Contact");
const formatDateAMPM = require("../utils/formatDate");

exports.getFlowDropOff = async (req, res) => {
    try {
        const { id: flowId } = req.params;
        const accountId = req.user.account_id;

        if (!mongoose.Types.ObjectId.isValid(flowId)) {
            return res.status(400).json({ message: "flowId inválido" });
        }

        const metrics = await ConversationSession.aggregate([
            {
                $match: {
                    flow_id: new mongoose.Types.ObjectId(flowId),
                    account_id: new mongoose.Types.ObjectId(accountId),
                    mode: "production",
                    history: { $exists: true, $ne: [] }
                }
            },

            {
                $addFields: {
                    last_step: { $arrayElemAt: ["$history", -1] }
                }
            },

            {
                $facet: {

                    // 🔹 VISITAS ÚNICAS POR SESIÓN
                    visits: [
                        { $unwind: "$history" },
                        {
                            $group: {
                                _id: {
                                    session: "$_id",
                                    node: "$history.node_id"
                                }
                            }
                        },
                        {
                            $group: {
                                _id: "$_id.node",
                                total_visits: { $sum: 1 }
                            }
                        }
                    ],

                    // 🔹 ABANDONOS
                    abandons: [
                        { $match: { is_completed: false } },
                        {
                            $group: {
                                _id: "$last_step.node_id",
                                abandons: { $sum: 1 }
                            }
                        }
                    ]
                }
            },

            {
                $project: {
                    combined: {
                        $map: {
                            input: "$visits",
                            as: "visit",
                            in: {
                                node_id: "$$visit._id",
                                total_visits: "$$visit.total_visits",
                                abandons: {
                                    $let: {
                                        vars: {
                                            match: {
                                                $arrayElemAt: [
                                                    {
                                                        $filter: {
                                                            input: "$abandons",
                                                            as: "ab",
                                                            cond: { $eq: ["$$ab._id", "$$visit._id"] }
                                                        }
                                                    },
                                                    0
                                                ]
                                            }
                                        },
                                        in: { $ifNull: ["$$match.abandons", 0] }
                                    }
                                }
                            }
                        }
                    }
                }
            },

            { $unwind: "$combined" },
            { $replaceRoot: { newRoot: "$combined" } },

            {
                $addFields: {
                    abandon_rate: {
                        $cond: [
                            { $eq: ["$total_visits", 0] },
                            0,
                            {
                                $round: [
                                    {
                                        $multiply: [
                                            { $divide: ["$abandons", "$total_visits"] },
                                            100
                                        ]
                                    },
                                    2
                                ]
                            }
                        ]
                    }
                }
            },

            { $sort: { abandon_rate: -1 } }
        ]);

        /* ---------------------------------------------
           Opcional: Enriquecer con información del nodo
        --------------------------------------------- */

        const nodes = await FlowNode.find({
            flow_id: flowId,
            account_id: accountId
        }).lean();

        const nodeMap = new Map(nodes.map(n => [String(n._id), n]));

        const enriched = metrics.map(m => {
            const node = nodeMap.get(String(m.node_id));

            return {
                node_id: m.node_id,
                node_type: node?.node_type || null,
                question: node?.content || null,
                total_visits: m.total_visits,
                abandons: m.abandons,
                abandon_rate: m.abandon_rate
            };
        });

        return res.json({
            flow_id: flowId,
            total_nodes: enriched.length,
            metrics: enriched
        });

    } catch (error) {
        console.error("getFlowDropOff:", error);
        return res.status(500).json({
            message: "Error obteniendo métricas"
        });
    }
};

exports.getContactsByDate = async (req, res) => {
    try {
        const { id: chatbotId } = req.params;
        const { from, to } = req.query;
        const accountId = req.user.account_id;

        if (!mongoose.Types.ObjectId.isValid(chatbotId)) {
            return res.status(400).json({ message: "chatbotId inválido" });
        }

        const match = {
            chatbot_id: new mongoose.Types.ObjectId(chatbotId),
            account_id: new mongoose.Types.ObjectId(accountId)
        };

        if (from || to) {
            match.createdAt = {};
            if (from) match.createdAt.$gte = new Date(from);
            if (to) match.createdAt.$lte = new Date(to);
        }

        const data = await Contact.aggregate([
            { $match: match },

            {
                $group: {
                    _id: {
                        year: { $year: "$createdAt" },
                        month: { $month: "$createdAt" },
                        day: { $dayOfMonth: "$createdAt" }
                    },
                    total: { $sum: 1 }
                }
            },

            {
                $project: {
                    date: {
                        $dateFromParts: {
                            year: "$_id.year",
                            month: "$_id.month",
                            day: "$_id.day"
                        }
                    },
                    total: 1,
                    _id: 0
                }
            },

            { $sort: { date: 1 } }
        ]);

        // 🔥 FORMATEO AQUÍ
        const formatted = data.map(item => ({
            ...item,
            date: formatDateAMPM(item.date)
        }));

        res.json(formatted);

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error obteniendo contactos por fecha" });
    }
};

exports.getContactsByHour = async (req, res) => {
    try {
        const { id: chatbotId } = req.params;
        const accountId = req.user.account_id;

        const data = await Contact.aggregate([
            {
                $match: {
                    chatbot_id: new mongoose.Types.ObjectId(chatbotId),
                    account_id: new mongoose.Types.ObjectId(accountId)
                }
            },

            {
                $group: {
                    _id: { $hour: "$createdAt" },
                    total: { $sum: 1 }
                }
            },

            {
                $project: {
                    hour: "$_id",
                    total: 1,
                    _id: 0
                }
            },

            { $sort: { hour: 1 } }
        ]);

        res.json(data);

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error obteniendo contactos por hora" });
    }
};

exports.getChatbotOverview = async (req, res) => {
    try {
        const { id: chatbotId } = req.params;
        const { from, to } = req.query;
        const accountId = req.user.account_id;

        if (!mongoose.Types.ObjectId.isValid(chatbotId)) {
            return res.status(400).json({ message: "chatbotId inválido" });
        }

        const fromDate = from ? new Date(from) : null;
        const toDate = to ? new Date(to) : null;

        const matchContacts = {
            chatbot_id: new mongoose.Types.ObjectId(chatbotId),
            account_id: new mongoose.Types.ObjectId(accountId)
        };

        if (fromDate || toDate) {
            matchContacts.createdAt = {};
            if (fromDate) matchContacts.createdAt.$gte = fromDate;
            if (toDate) matchContacts.createdAt.$lte = toDate;
        }

        /* =============================
           1️⃣ CONTACTOS ACTUALES
        ============================= */

        const contactsData = await Contact.aggregate([
            { $match: matchContacts },
            {
                $facet: {
                    summary: [
                        { $count: "total_contacts" }
                    ],
                    by_date: [
                        {
                            $group: {
                                _id: {
                                    year: { $year: "$createdAt" },
                                    month: { $month: "$createdAt" },
                                    day: { $dayOfMonth: "$createdAt" }
                                },
                                total: { $sum: 1 }
                            }
                        },
                        {
                            $project: {
                                date: {
                                    $dateFromParts: {
                                        year: "$_id.year",
                                        month: "$_id.month",
                                        day: "$_id.day"
                                    }
                                },
                                total: 1,
                                _id: 0
                            }
                        },
                        { $sort: { date: 1 } }
                    ],
                    by_hour: [
                        {
                            $group: {
                                _id: { $hour: "$createdAt" },
                                total: { $sum: 1 }
                            }
                        },
                        {
                            $project: {
                                hour: "$_id",
                                total: 1,
                                _id: 0
                            }
                        },
                        { $sort: { hour: 1 } }
                    ]
                }
            }
        ]);

        const currentTotal =
            contactsData[0].summary[0]?.total_contacts || 0;

        /* =============================
           2️⃣ PERIODO ANTERIOR
        ============================= */

        let previousTotal = 0;

        if (fromDate && toDate) {
            const diff = toDate - fromDate;
            const prevFrom = new Date(fromDate - diff);
            const prevTo = new Date(toDate - diff);

            previousTotal = await Contact.countDocuments({
                chatbot_id: chatbotId,
                account_id: accountId,
                createdAt: { $gte: prevFrom, $lte: prevTo }
            });
        }

        const growthRate =
            previousTotal === 0
                ? 0
                : Number(
                    (((currentTotal - previousTotal) / previousTotal) * 100).toFixed(2)
                );

        /* =============================
           3️⃣ CONVERSION RATE
        ============================= */

        const totalSessions = await ConversationSession.countDocuments({
            chatbot_id: chatbotId,
            account_id: accountId,
            mode: "production",
            ...(fromDate && toDate && {
                createdAt: { $gte: fromDate, $lte: toDate }
            })
        });

        const conversionRate =
            totalSessions === 0
                ? 0
                : Number(((currentTotal / totalSessions) * 100).toFixed(2));

        /* =============================
           🔥 FORMATEO DE FECHAS AQUÍ
        ============================= */

        const formattedByDate = contactsData[0].by_date.map(item => ({
            ...item,
            date: formatDateAMPM(item.date)
        }));

        /* =============================
           RESPONSE
        ============================= */

        res.json({
            summary: {
                total_contacts: currentTotal,
                previous_period_contacts: previousTotal,
                growth_rate: growthRate,
                conversion_rate: conversionRate
            },
            by_date: formattedByDate,
            by_hour: fillMissingHours(contactsData[0].by_hour)
        });

    } catch (error) {
        console.error("getChatbotOverview:", error);
        res.status(500).json({
            message: "Error obteniendo overview"
        });
    }
};

exports.getContactsByOrigin = async (req, res) => {
    try {
        const { id: chatbotId } = req.params;
        const accountId = req.user.account_id;

        const data = await Contact.aggregate([
            {
                $match: {
                    chatbot_id: new mongoose.Types.ObjectId(chatbotId),
                    account_id: new mongoose.Types.ObjectId(accountId),
                    origin_url: { $ne: null }
                }
            },
            {
                $group: {
                    _id: "$origin_url",
                    total: { $sum: 1 }
                }
            },
            { $sort: { total: -1 } }
        ]);

        res.json(data.map(d => ({
            url: d._id,
            total: d.total
        })));

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Error obteniendo contactos por URL"
        });
    }
};

exports.getContactsDetail = async (req, res) => {
    try {
        const { id: chatbotId } = req.params;
        const accountId = req.user.account_id;

        const contacts = await Contact.find({
            chatbot_id: chatbotId,
            account_id: accountId
        })
            .sort({ createdAt: -1 })
            .lean();

        const formatted = contacts.map(c => ({
            id: c._id,
            received: formatDateAMPM(c.createdAt),
            name: c.variables?.name || c.name,
            email: c.variables?.email || c.email,
            status: c.status
        }));

        res.json(formatted);

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Error obteniendo contactos"
        });
    }
};

/* =============================
   Helper para completar horas
============================= */

function fillMissingHours(data) {
    const hours = Array.from({ length: 24 }, (_, i) => i);

    return hours.map(hour => {
        const found = data.find(d => d.hour === hour);
        return {
            hour,
            total: found ? found.total : 0
        };
    });
}