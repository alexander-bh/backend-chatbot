module.exports = {

  text: (data) => {
    const patch = {};
    if (data.content !== undefined) patch.content = data.content;
    if (data.typing_time !== undefined) patch.typing_time = data.typing_time;
    return patch;
  },

  text_input: (data) => {
    const patch = {};
    if (data.content !== undefined) patch.content = data.content;
    if (data.variable_key !== undefined) patch.variable_key = data.variable_key;
    if (data.validation !== undefined) patch.validation = data.validation;
    if (data.typing_time !== undefined) patch.typing_time = data.typing_time;
    return patch;
  },

  options: (data) => {
    const patch = {};
    if (data.content !== undefined) patch.content = data.content;
    if (data.options !== undefined) patch.options = data.options;
    if (data.typing_time !== undefined) patch.typing_time = data.typing_time;
    return patch;
  },

  link: (data) => {
    const patch = {};
    if (data.content !== undefined) patch.content = data.content;
    if (data.link_action !== undefined) patch.link_action = data.link_action;
    return patch;
  },

  data_policy: (data) => {
    const patch = {};
    if (data.policy !== undefined) patch.policy = data.policy;
    return patch;
  },

  jump: () => ({}),

  email: (data) => {
    const patch = {};
    if (data.content !== undefined) patch.content = data.content;
    if (data.variable_key !== undefined) patch.variable_key = data.variable_key;
    if (data.validation !== undefined) patch.validation = data.validation;
    return patch;
  },

  phone: (data) => {
    const patch = {};
    if (data.content !== undefined) patch.content = data.content;
    if (data.variable_key !== undefined) patch.variable_key = data.variable_key;
    if (data.validation !== undefined) patch.validation = data.validation;
    return patch;
  },

  number: (data) => {
    const patch = {};
    if (data.content !== undefined) patch.content = data.content;
    if (data.variable_key !== undefined) patch.variable_key = data.variable_key;
    if (data.validation !== undefined) patch.validation = data.validation;
    return patch;
  }

};

