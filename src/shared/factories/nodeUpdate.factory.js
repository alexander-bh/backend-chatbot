module.exports = {
  text: (data) => ({
    content: data.content,
    typing_time: data.typing_time
  }),

  question: (data) => ({
    content: data.content,
    variable_key: data.variable_key,
    validation: data.validation,
    typing_time: data.typing_time
  }),

  options: (data) => ({
    content: data.content,
    options: data.options,
    typing_time: data.typing_time
  }),

  link: (data) => ({
    content: data.content,
    link_action: data.link_action
  }),

  data_policy: (data) => ({
    policy: data.policy
  }),

  jump: () => ({}), // no editable, solo conexiones

  email: (data) => ({
    content: data.content,
    variable_key: data.variable_key,
    validation: data.validation
  }),

  phone: (data) => ({
    content: data.content,
    variable_key: data.variable_key,
    validation: data.validation
  }),

  number: (data) => ({
    content: data.content,
    variable_key: data.variable_key,
    validation: data.validation
  })
};
