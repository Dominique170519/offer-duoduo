export interface QuestionOption {
  label: string;
  text: string;
}

export interface PracticeQuestion {
  id: string;
  index: number;
  category: string;
  stem: string;
  options: QuestionOption[];
  answer: string;
  analysis: string;
}
