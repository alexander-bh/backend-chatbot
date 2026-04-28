const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_BASE = "https://api.brevo.com/v3";

async function brevoRequest(method, path, body = null) {
  const res = await fetch(`${BREVO_BASE}${path}`, {
    method,
    headers: {
      "api-key": BREVO_API_KEY,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  // 204 No Content = éxito sin cuerpo (ej: DELETE)
  if (res.status === 204) return null;

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const err = new Error(data?.message || `Brevo error ${res.status}`);
    err.statusCode = res.status;
    err.body = data;
    throw err;
  }

  return data;
}

async function upsertBrevoContact(email, attributes = {}, listIds = []) {
  return brevoRequest("POST", "/contacts", {
    email,
    attributes,
    listIds,
    updateEnabled: true
  });
}

async function removeBrevoContactFromList(email, listId) {
  try {
    return await brevoRequest("POST", `/contacts/lists/${listId}/contacts/remove`, {
      emails: [email]
    });
  } catch (err) {
    // Brevo devuelve 400 si el contacto no está en la lista — no es error real
    if (err.statusCode === 400 || err.statusCode === 404) {
      console.warn(`⚠️ Brevo: ${email} no estaba en lista ${listId}, omitiendo`);
      return null;
    }
    throw err;
  }
}

async function deleteBrevoContact(email) {
  try {
    // 1. Obtener el ID del contacto
    const contact = await brevoRequest("GET", `/contacts/${encodeURIComponent(email)}`);
    const contactId = contact?.id;

    if (!contactId) {
      console.warn(`⚠️ Brevo: ${email} sin ID`);
      return null;
    }

    // 2. Eliminar por ID (evita el bug del SDK con email)
    await brevoRequest("DELETE", `/contacts/${contactId}`);
    console.log(`✅ Brevo: contacto ${email} (id:${contactId}) eliminado`);
    return null;

  } catch (err) {
    if (err.statusCode === 404) {
      console.warn(`⚠️ Brevo: ${email} no existe, omitiendo`);
      return null;
    }
    throw err;
  }
}

module.exports = {
  upsertBrevoContact,
  removeBrevoContactFromList,
  deleteBrevoContact
};