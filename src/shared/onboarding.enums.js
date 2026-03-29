const USO_HERRAMIENTA = {
  NEGOCIO: {
    key: "NEGOCIO",
    label: "Para mi negocio o emprendimiento",
    description: "Quiero usar la herramienta para impulsar o gestionar mi negocio"
  },
  EQUIPO_COMERCIAL: {
    key: "EQUIPO_COMERCIAL",
    label: "Para un equipo comercial",
    description: "Mi equipo usará la herramienta para atender clientes o vender"
  },
  APRENDER: {
    key: "APRENDER",
    label: "Para aprender y probar",
    description: "Quiero explorar cómo funciona la herramienta"
  },
  PROYECTO_PERSONAL: {
    key: "PROYECTO_PERSONAL",
    label: "Para un proyecto personal",
    description: "Uso personal o proyecto independiente"
  }
};

const OBJETIVO = {
  AUMENTAR_VENTAS: {
    key: "AUMENTAR_VENTAS",
    label: "Aumentar mis ventas",
    description: "Convertir más clientes y vender más"
  },
  AUTOMATIZAR_RESPUESTAS: {
    key: "AUTOMATIZAR_RESPUESTAS",
    label: "Automatizar respuestas",
    description: "Responder automáticamente a mis clientes"
  },
  ORGANIZAR_CONTACTOS_O_IDEAS: {
    key: "ORGANIZAR_CONTACTOS_O_IDEAS",
    label: "Organizar contactos o ideas",
    description: "Centralizar información importante"
  },
  SOLO_VER_FUNCIONAMIENTO: {
    key: "SOLO_VER_FUNCIONAMIENTO",
    label: "Solo ver cómo funciona",
    description: "Explorar sin un objetivo definido"
  }
};

const USO_HERRAMIENTA_KEYS = Object.values(USO_HERRAMIENTA).map(
  item => item.key
);

const OBJETIVO_KEYS = Object.values(OBJETIVO).map(
  item => item.key
);

module.exports = {
  USO_HERRAMIENTA,
  OBJETIVO,
  USO_HERRAMIENTA_KEYS,
  OBJETIVO_KEYS
};
