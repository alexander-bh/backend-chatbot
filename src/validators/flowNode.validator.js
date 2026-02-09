const {
  NODE_TYPES,
  CONTENT_REQUIRED,
  OPTIONS_REQUIRED
} = require("../config/nodeTypes");

const VARIABLE_KEY_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const normalizeEmails = emails =>
  Array.isArray(emails)
    ? [...new Set(emails)]
        .map(e => String(e).toLowerCase().trim())
        .filter(e =>
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
        )
    : [];

module.exports = function validateFlowNodes(nodes = []) {

  if (!Array.isArray(nodes) || nodes.length === 0) {
    throw new Error("nodes requeridos");
  }

  const variableKeys = new Set();

  nodes.forEach((node, index) => {

    /* ───────── TYPE ───────── */

    if (!NODE_TYPES.includes(node.node_type)) {
      throw new Error(
        `node_type inválido en nodo ${index}`
      );
    }

    /* ───────── VARIABLE KEY ───────── */

    if (node.variable_key) {

      if (!VARIABLE_KEY_REGEX.test(node.variable_key)) {
        throw new Error(
          `variable_key inválido en nodo ${index}`
        );
      }

      if (variableKeys.has(node.variable_key)) {
        throw new Error(
          `variable_key duplicado: ${node.variable_key}`
        );
      }

      variableKeys.add(node.variable_key);
    }

    /* ───────── CONTENT ───────── */

    if (CONTENT_REQUIRED.includes(node.node_type)) {

      if (
        !node.content ||
        typeof node.content !== "string"
      ) {
        throw new Error(
          `content requerido en nodo ${index}`
        );
      }
    }

    /* ───────── OPTIONS ───────── */

    if (OPTIONS_REQUIRED.includes(node.node_type)) {

      if (
        !Array.isArray(node.options) ||
        node.options.length === 0
      ) {
        throw new Error(
          `options requeridas en nodo ${index}`
        );
      }

      node.options.forEach((opt, i) => {

        if (!opt.label) {
          throw new Error(
            `label inválido en option ${i} nodo ${index}`
          );
        }
      });
    }

    /* ───────── LINK / JUMP ───────── */

    if (node.node_type === "link") {
      if (!node.link_action) {
        throw new Error(
          `link_action requerido en nodo ${index}`
        );
      }
    }

    if (node.node_type === "jump") {
      if (!node.next_node_id) {
        throw new Error(
          `jump requiere next_node_id nodo ${index}`
        );
      }
    }

    /* ───────── DATA POLICY ───────── */

    if (node.node_type === "data_policy") {

      if (!node.meta?.policy_text) {
        throw new Error(
          `data_policy requiere policy_text nodo ${index}`
        );
      }
    }

    /* ───────── NOTIFICACIONES ───────── */

    if (node.meta?.notify?.enabled) {

      const recipients = normalizeEmails(
        node.meta.notify.recipients || []
      );

      if (recipients.length === 0) {
        throw new Error(
          `notify sin correos válidos nodo ${index}`
        );
      }

      node.meta.notify.recipients = recipients;
    }

  });

  return true;
};
