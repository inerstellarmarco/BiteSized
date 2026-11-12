export type ScoreQuestion = {
  id: string;
  correctChoiceId: string;
};

export type ScoreAnswer = {
  questionId: string;
  selectedChoiceId: string | null;
};

export type QuizScore = {
  correct: number;
  answered: number;
  total: number;
  wrongIds: string[];
  stoppedEarly: boolean;
};

export function scoreQuiz(questions: ScoreQuestion[], answers: ScoreAnswer[]): QuizScore {
  const byId = new Map(questions.map((question) => [question.id, question]));
  const seen = new Set<string>();
  let correct = 0;
  const wrongIds: string[] = [];

  for (const answer of answers) {
    if (!answer.selectedChoiceId || seen.has(answer.questionId)) continue;
    const question = byId.get(answer.questionId);
    if (!question) continue;
    seen.add(answer.questionId);
    if (question.correctChoiceId === answer.selectedChoiceId) {
      correct += 1;
    } else {
      wrongIds.push(question.id);
    }
  }

  const answered = seen.size;
  return {
    correct,
    answered,
    total: questions.length,
    wrongIds,
    stoppedEarly: answered < questions.length,
  };
}
