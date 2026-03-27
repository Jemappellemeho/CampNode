/**
 * AI Service (backend/src/services/aiService.js)
 */

exports.generateSummary = async (content) => {
  return `Summary for ${content}: Focuses on implementation, security, and scalability.`;
};

exports.generateQuiz = async (topicName) => {
  console.log(`[AI Service] Generating 15 unique questions for: ${topicName}`);
  
  // Creating a pool of 15 unique questions
  return [
    // --- ROUND 1 (Types 1-5) ---
    { type: "multiple_choice", question: `What is the primary goal of ${topicName}?`, options: ["Efficiency", "Redundancy", "Latency", "Storage"], correctIndex: 0, explanation: "Efficiency is the main driver.", points: 10 },
    { type: "true_false", question: `Is ${topicName} a modern industry standard?`, correctAnswer: true, explanation: "Yes, it is widely adopted.", points: 10 },
    { type: "multiple_select", question: "Which benefits apply? (Select all)", options: ["Speed", "Security", "Bloat", "Scalability"], correctIndices: [0, 1, 3], explanation: "Speed, Security, and Scalability are key.", points: 10 },
    { type: "reorder", question: "Order the standard implementation steps:", items: ["Setup", "Logic", "Test", "Deploy"], correctOrder: [0, 1, 2, 3], explanation: "Standard dev lifecycle flow.", points: 10 },
    { type: "open_answer", question: "What is the common 4-letter acronym for database operations?", acceptedAnswers: ["CRUD"], hint: "C_U_.", explanation: "CRUD stands for Create, Read, Update, Delete.", points: 10 },
    
    // --- ROUND 2 (Types 1-5 Unique) ---
    { type: "multiple_choice", question: `Which layer usually handles ${topicName}?`, options: ["Application", "Data", "Presentation", "Transport"], correctIndex: 0, explanation: "Usually handled at the logic/app layer.", points: 10 },
    { type: "true_false", question: "Does this concept increase system technical debt?", correctAnswer: false, explanation: "When implemented correctly, it reduces long-term debt.", points: 10 },
    { type: "multiple_select", question: "Common tools used here include:", options: ["React", "Node.js", "SQL", "Docker"], correctIndices: [0, 1, 2], explanation: "Standard full-stack tools apply.", points: 10 },
    { type: "reorder", question: "Order by execution priority:", items: ["Input", "Parse", "Execute", "Return"], correctOrder: [0, 1, 2, 3], explanation: "Data must be parsed before execution.", points: 10 },
    { type: "open_answer", question: "What 'S' in SOLID stands for Single Responsibility?", acceptedAnswers: ["Single"], hint: "Opposite of Multiple.", explanation: "The S stands for Single Responsibility Principle.", points: 10 },

    // --- ROUND 3 (Types 1-5 Unique) ---
    { type: "multiple_choice", question: "What is the biggest risk here?", options: ["Data Loss", "High Cost", "Slow UI", "Memory Leak"], correctIndex: 0, explanation: "Data integrity is always the highest risk.", points: 10 },
    { type: "true_false", question: "Is documentation optional for this process?", correctAnswer: false, explanation: "Documentation is critical for maintenance.", points: 10 },
    { type: "multiple_select", question: "Which environments should this run in?", options: ["Dev", "Staging", "Prod", "None"], correctIndices: [0, 1, 2], explanation: "All environments must be synced.", points: 10 },
    { type: "reorder", question: "Order these by complexity (Simple to Hard):", items: ["Variable", "Function", "Class", "Module"], correctOrder: [0, 1, 2, 3], explanation: "Hierarchy of code complexity.", points: 10 },
    { type: "open_answer", question: "What is the short name for a Web Application Interface?", acceptedAnswers: ["API"], hint: "A_I.", explanation: "API is the standard term.", points: 10 }
  ];
};

exports.suggestPrerequisites = async () => [];