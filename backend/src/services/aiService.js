// Public AI service facade used by controllers.
// Quiz-specific internals live in ./quizGeneration.
const quizEngine = require("./quizGeneration/quizEngine");

module.exports = {
  generateSummary: quizEngine.generateSummary,
  generateQuiz: quizEngine.generateQuiz,
  ingestToRAG: quizEngine.ingestToRAG,
  suggestPrerequisites: quizEngine.suggestPrerequisites,
};
