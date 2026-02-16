const mongoose = require("mongoose");
require("dotenv").config();
const CRMField = require("../models/CrmField");

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    await CRMField.deleteMany({}); // ⚠️ usar solo en dev
    await CRMField.insertMany([
      { key: "last_name", label: "Apellido del Prospecto", is_active: true },
      { key: "job_title", label: "Cargo en la Empresa" , is_active: true },
      { key: "country", label: "País", is_active: true },
      { key: "city", label: "Ciudad", is_active: true },
      { key: "skype", label: "Skype", is_active: true },
      { key: "linkedin", label: "LinkedIn", is_active: true },
      { key: "address", label: "Dirección", is_active: true },
      { key: "company", label: "Empresa", is_active: true },
      { key: "website", label: "Sitio Web", is_active: true },
      { key: "company_phone", label: "Teléfono de la Empresa", is_active: true },
      { key: "phone_ext", label: "Extensión telefónica", is_active: true },
      { key: "notes", label: "Observaciones", is_active: true },
      { key: "privacy", label: "Tratamiento de Datos Personales", is_active: true }
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
