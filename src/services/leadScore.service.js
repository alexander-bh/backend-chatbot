const SCORE_RULES = {
  email: 20,
  phone: 30,
  name: 5,
  company: 15,
  completed_conversation: 40
};

function calculateLeadScore(session) {

  let score = 0;

  const variables = session.variables || {};

  for (const field in SCORE_RULES) {

    if (field === "completed_conversation") continue;
    const value = variables[field];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      score += SCORE_RULES[field];
    }
  }

  if (session.is_completed) {
    score += SCORE_RULES.completed_conversation;
  }

  return score;
}

module.exports = calculateLeadScore;