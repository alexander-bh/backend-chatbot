/** 
 * Variables soportadas:
 *   {{chatbot_name}} → nombre del chatbot
 * 
 * @param {string} content  - Texto del nodo
 * @param {object} context  - { chatbot_name, ... }
 * @returns {string}
 */
const resolveNodeVariables = (content, context = {}) => {
  if (!content || typeof content !== "string") return content;

  return content.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return context[key] !== undefined ? context[key] : match;
  });
};

module.exports = resolveNodeVariables;