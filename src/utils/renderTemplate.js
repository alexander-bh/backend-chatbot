// utils/renderTemplate Esta se usa 
module.exports = function renderTemplate(template, variables = {}) {
  return template.replace(/{{\s*(\w+)\s*}}/g, (_, key) => {
    return variables[key] ?? "";
  });
};
