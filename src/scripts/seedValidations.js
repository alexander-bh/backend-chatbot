// seeds/seedValidations.js
const mongoose = require("mongoose");
require("dotenv").config();
const ValidationRule = require("../models/ValidationRule");

async function seed() {
    try {

        console.log("URI usada:", process.env.MONGO_URI);

        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ Mongo conectado");

        const deleted = await ValidationRule.deleteMany({});
        console.log("Eliminados:", deleted.deletedCount);

        const inserted = await ValidationRule.insertMany([

            {
                key: "required",
                label: "Obligatorio",
                category: "text",
                default_message: "Este campo es obligatorio"
            },
            {
                key: "min_length",
                label: "Longitud mínima",
                category: "text",
                default_message: "Debe tener al menos {min} caracteres",
                has_params: true
            },
            {
                key: "max_length",
                label: "Longitud máxima",
                category: "text",
                default_message: "No debe superar {max} caracteres",
                has_params: true
            },

            /* =====================================================
               🔹 TELÉFONO
            ===================================================== */

            {
                key: "phone_required",
                label: "Obligatorio",
                category: "phone",
                default_message: "El teléfono es obligatorio"
            },
            {
                key: "phone_format",
                label: "Formato teléfono",
                category: "phone",
                default_message: "Formato de teléfono inválido"
            },
            {
                key: "phone_mx",
                label: "Teléfono México (+52)",
                category: "phone",
                default_message: "Debe iniciar con +52 y 10 dígitos"
            },
            {
                key: "phone_country",
                label: "Con código país (+00)",
                category: "phone",
                default_message: "Debe incluir código de país"
            },
            {
                key: "phone_length",
                label: "Longitud Min/Max",
                category: "phone",
                default_message: "Longitud de teléfono inválida",
                has_params: true
            },

            /* =====================================================
               🔹 NUMÉRICOS
            ===================================================== */

            {
                key: "number_required",
                label: "Obligatorio",
                category: "number",
                default_message: "Este número es obligatorio"
            },
            {
                key: "integer_only",
                label: "Solo enteros",
                category: "number",
                default_message: "Solo se permiten números enteros"
            },
            {
                key: "allow_decimal",
                label: "Permitir decimales",
                category: "number",
                default_message: "Número decimal inválido"
            },
            {
                key: "number_min",
                label: "Número mínimo",
                category: "number",
                default_message: "El valor es menor al permitido",
                has_params: true
            },
            {
                key: "number_max",
                label: "Número máximo",
                category: "number",
                default_message: "El valor supera el máximo permitido",
                has_params: true
            },

            /* =====================================================
               🔹 EMAIL
            ===================================================== */

            {
                key: "email_required",
                label: "Obligatorio",
                category: "email",
                default_message: "El correo es obligatorio"
            },
            {
                key: "email_format",
                label: "Formato email",
                category: "email",
                default_message: "Correo electrónico inválido"
            },

            /* =====================================================
               🔹 LINKS
            ===================================================== */

            {
                key: "url_format",
                label: "Formato URL",
                category: "link",
                default_message: "URL inválida"
            },
            {
                key: "https_only",
                label: "Solo HTTPS",
                category: "link",
                default_message: "Debe usar https://"
            },

            /* =====================================================
               🔹 WHATSAPP LINK
            ===================================================== */

            {
                key: "whatsapp_format",
                label: "Formato WhatsApp",
                category: "link",
                default_message: "El enlace debe ser válido de WhatsApp"
            }
        ]);

        console.log("Insertados:", inserted.length);

        const check = await ValidationRule.find();
        console.log("Total en DB:", check.length);

    } catch (error) {
        console.error("❌ ERROR:", error);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
}

seed();
