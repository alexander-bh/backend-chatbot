const NODE_FACTORY = {
  text: (data) => ({
    content: data.content ?? "",
    typing_time: data.typing_time ?? 2,
    next_node_id: null
  }),

  options: (data) => ({
    content: data.content ?? "",
    options: data.options ?? []
  }),

  text_input: (data) => ({
    content: data.content ?? "",
    variable_key: data.variable_key,
    validation: data.validation,
    next_node_id: null
  }),

  email: (data) => ({
    content: data.content ?? "",
    variable_key: data.variable_key ?? "email",
    validation: data.validation,
    crm_field_key: "email",
    next_node_id: null
  }),

  phone: (data) => ({
    content: data.content ?? "",
    variable_key: data.variable_key ?? "phone",
    validation: data.validation,
    crm_field_key: "phone",
    next_node_id: null
  }),

  number: (data) => ({
    content: data.content ?? "",
    variable_key: data.variable_key,
    validation: data.validation,
    next_node_id: null
  }),

  link: (data) => ({
    content: data.content ?? "",
    link_action: data.link_action,
    next_node_id: null
  }),

  data_policy: (data) => ({
    content: data.content ?? "",
    policy: data.policy
  }),

  jump: (data) => ({
    content: data.content ?? "",
    next_node_id: data.next_node_id
  }),

  end: () => ({
    end_conversation: true
  })
};

module.exports = NODE_FACTORY;