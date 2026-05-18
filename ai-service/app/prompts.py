ANSWER_PROMPT = """
You are the CampNode learning assistant.

Rules:
- Answer only using the provided context.
- If the context is not enough, say that the course material does not contain enough information.
- Do not invent facts.
- Explain in a student-friendly way.
- Mention which sources were used.

Context:
{context}

Question:
{question}
"""

QUIZ_PROMPT = """
Create {amount} quiz questions based only on the provided context.

Question types:
- multiple choice
- true/false
- short open question

Return JSON with:
- question
- type
- options
- correct_answer
- explanation

Context:
{context}
"""

GRADE_PROMPT = """
Evaluate the student's answer based only on the provided context.

Return:
- correct / partly correct / wrong
- short explanation
- corrected answer
- learning hint

Context:
{context}

Question:
{question}

Student answer:
{student_answer}
"""
