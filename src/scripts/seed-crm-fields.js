const mongoose = require("mongoose");
require("dotenv").config();
const CRMField = require("../src/models/CRMField");

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("🟢 Mongo conectado");

    await CRMField.deleteMany({}); // ⚠️ usar solo en dev

    await CRMField.insertMany([
      { key: "last_name", label: "Apellido del Prospecto" },
      { key: "job_title", label: "Cargo en la Empresa" },
      { key: "country", label: "País" },
      { key: "city", label: "Ciudad" },
      { key: "skype", label: "Skype" },
      { key: "linkedin", label: "LinkedIn" },
      { key: "address", label: "Dirección" },
      { key: "company", label: "Empresa" },
      { key: "website", label: "Sitio Web" },
      { key: "company_phone", label: "Teléfono de la Empresa" },
      { key: "phone_ext", label: "Extensión telefónica" },
      { key: "notes", label: "Observaciones" },
      { key: "privacy", label: "Tratamiento de Datos Personales" }
    ]);

    console.log("CRM Fields creados");
  } catch (error) {
    console.error("Error al hacer seed:", error);
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
}

seed();
