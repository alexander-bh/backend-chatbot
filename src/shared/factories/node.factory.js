const NODE_FACTORY = {

  text: (data) => ({
    content: data.content ?? "",
    typing_time: data.typing_time ?? 2
  }),

  options: (data) => ({
    content: data.content ?? "",
    options: data.options ?? [],
    typing_time: data.typing_time ?? 2
  }),

  text_input: (data) => ({
    content: data.content ?? "",
    variable_key: data.variable_key,
    validation: data.validation,
    typing_time: data.typing_time ?? 2
  }),

  email: (data) => ({
    content: data.content ?? "",
    variable_key: data.variable_key ?? "email",
    validation: data.validation,
    crm_field_key: "email",
    typing_time: data.typing_time ?? 2
  }),

  phone: (data) => ({
    content: data.content ?? "",
    variable_key: data.variable_key ?? "phone",
    validation: data.validation,
    crm_field_key: "phone",
    typing_time: data.typing_time ?? 2
  }),

  number: (data) => ({
    content: data.content ?? "",
    variable_key: data.variable_key,
    validation: data.validation,
    typing_time: data.typing_time ?? 2
  }),

  link: (data) => ({
    content: data.content ?? "",
    link_action: data.link_action
  }),

  data_policy: (data) => ({
    content: data.content ?? "",
    policy: data.policy
  }),

  jump: () => ({}),

  end: () => ({
    end_conversation: true
  })
};

module.exports = NODE_FACTORY;
