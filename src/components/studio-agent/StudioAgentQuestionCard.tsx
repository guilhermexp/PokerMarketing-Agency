import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ChevronUp, ChevronDown, CornerDownLeft } from 'lucide-react';
import type { StudioAgentInteraction } from '../../services/api/studioAgent';

interface StudioAgentQuestionCardProps {
  interaction: StudioAgentInteraction;
  isBusy?: boolean;
  hasCustomText?: boolean;
  expired?: boolean;
  onSubmit: (answers: Record<string, string>) => void;
  onSkip: () => void;
}

export const StudioAgentQuestionCard: React.FC<StudioAgentQuestionCardProps> = memo(({
  interaction,
  isBusy = false,
  hasCustomText = false,
  expired = false,
  onSubmit,
  onSkip,
}) => {
  const questions = useMemo(() => {
    if (Array.isArray(interaction.questions) && interaction.questions.length > 0) {
      return interaction.questions;
    }

    return [{
      id: 'q_1',
      header: interaction.header || 'Pergunta',
      question: interaction.question,
      multiSelect: false,
      options: interaction.options || [],
    }];
  }, [interaction]);

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [focusedOptionIndex, setFocusedOptionIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  const prevIndexRef = useRef(currentQuestionIndex);

  useEffect(() => {
    setCurrentQuestionIndex(0);
    setAnswers({});
    setFocusedOptionIndex(0);
    setIsVisible(true);
  }, [interaction.interactionId]);

  useEffect(() => {
    if (prevIndexRef.current !== currentQuestionIndex) {
      setIsVisible(false);
      const timer = setTimeout(() => setIsVisible(true), 50);
      prevIndexRef.current = currentQuestionIndex;
      return () => clearTimeout(timer);
    }
  }, [currentQuestionIndex]);

  const currentQuestion = questions[currentQuestionIndex];
  const currentOptions = currentQuestion?.options || [];
  const isLastQuestion = currentQuestionIndex === questions.length - 1;

  const isOptionSelected = useCallback((questionText: string, optionLabel: string) => {
    return (answers[questionText] || []).includes(optionLabel);
  }, [answers]);

  const handleOptionClick = useCallback((questionText: string, optionLabel: string, questionIndex: number) => {
    const question = questions[questionIndex];
    const allowMultiple = Boolean(question?.multiSelect);
    const isLast = questionIndex === questions.length - 1;

    setAnswers((prev) => {
      const current = prev[questionText] || [];

      if (allowMultiple) {
        if (current.includes(optionLabel)) {
          return {
            ...prev,
            [questionText]: current.filter((value) => value !== optionLabel),
          };
        }

        return {
          ...prev,
          [questionText]: [...current, optionLabel],
        };
      }

      return {
        ...prev,
        [questionText]: [optionLabel],
      };
    });

    if (!allowMultiple && !isLast) {
      setTimeout(() => {
        setCurrentQuestionIndex(questionIndex + 1);
        setFocusedOptionIndex(0);
      }, 150);
    }
  }, [questions]);

  const currentQuestionHasAnswer = (answers[currentQuestion?.question || ''] || []).length > 0;
  const allQuestionsAnswered = questions.every((question) => (answers[question.question] || []).length > 0);

  const submitAnswers = useCallback(() => {
    const formatted: Record<string, string> = {};
    for (const question of questions) {
      const selected = answers[question.question] || [];
      if (selected.length > 0) {
        formatted[question.question] = selected.join(', ');
      }
    }
    onSubmit(formatted);
  }, [answers, onSubmit, questions]);

  const handleContinue = useCallback(() => {
    if (isBusy) return;

    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setFocusedOptionIndex(0);
      return;
    }

    if (allQuestionsAnswered) {
      submitAnswers();
    }
  }, [allQuestionsAnswered, currentQuestionIndex, isBusy, questions.length, submitAnswers]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isBusy || expired) return;

      const activeEl = document.activeElement;
      if (
        activeEl instanceof HTMLInputElement
        || activeEl instanceof HTMLTextAreaElement
        || activeEl?.getAttribute('contenteditable') === 'true'
      ) {
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (focusedOptionIndex < currentOptions.length - 1) {
          setFocusedOptionIndex(focusedOptionIndex + 1);
        } else if (currentQuestionIndex < questions.length - 1) {
          setCurrentQuestionIndex(currentQuestionIndex + 1);
          setFocusedOptionIndex(0);
        }
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (focusedOptionIndex > 0) {
          setFocusedOptionIndex(focusedOptionIndex - 1);
        } else if (currentQuestionIndex > 0) {
          const prevOptions = questions[currentQuestionIndex - 1]?.options || [];
          setCurrentQuestionIndex(currentQuestionIndex - 1);
          setFocusedOptionIndex(Math.max(0, prevOptions.length - 1));
        }
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (currentQuestionHasAnswer) {
          handleContinue();
        } else if (currentOptions[focusedOptionIndex]) {
          handleOptionClick(
            currentQuestion.question,
            currentOptions[focusedOptionIndex].label,
            currentQuestionIndex,
          );
        }
      } else if (event.key >= '1' && event.key <= '9') {
        const index = Number.parseInt(event.key, 10) - 1;
        if (index >= 0 && index < currentOptions.length) {
          event.preventDefault();
          handleOptionClick(currentQuestion.question, currentOptions[index].label, currentQuestionIndex);
          setFocusedOptionIndex(index);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    currentOptions,
    currentQuestion,
    currentQuestionHasAnswer,
    currentQuestionIndex,
    expired,
    focusedOptionIndex,
    handleContinue,
    handleOptionClick,
    isBusy,
    questions,
  ]);

  if (!currentQuestion) return null;

  return (
    <div className="border rounded-t-xl border-b-0 border-border bg-muted/30 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] text-muted-foreground">
            {currentQuestion.header || 'Pergunta'}
          </span>
          <span className="text-muted-foreground/50">•</span>
          <span className="text-[12px] text-muted-foreground">
            {expired ? 'Expirada' : currentQuestion.multiSelect ? 'Multi-select' : 'Single-select'}
          </span>
        </div>

        {questions.length > 1 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                if (currentQuestionIndex > 0) {
                  setCurrentQuestionIndex(currentQuestionIndex - 1);
                  setFocusedOptionIndex(0);
                }
              }}
              disabled={currentQuestionIndex === 0 || isBusy}
              className="p-0.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed outline-none"
            >
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            </button>
            <span className="text-xs text-muted-foreground px-1">
              {currentQuestionIndex + 1} / {questions.length}
            </span>
            <button
              type="button"
              onClick={() => {
                if (currentQuestionIndex < questions.length - 1) {
                  setCurrentQuestionIndex(currentQuestionIndex + 1);
                  setFocusedOptionIndex(0);
                }
              }}
              disabled={currentQuestionIndex === questions.length - 1 || isBusy}
              className="p-0.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed outline-none"
            >
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        )}
      </div>

      <div className={`px-1 pb-2 transition-opacity duration-150 ease-out ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
        <div className="text-[14px] font-[450] text-foreground mb-3 pt-1 px-2">
          <span className="text-muted-foreground">{currentQuestionIndex + 1}.</span> {currentQuestion.question}
        </div>

        <div className="space-y-1">
          {currentOptions.map((option, optionIndex) => {
            const selectedOption = isOptionSelected(currentQuestion.question, option.label);
            const focused = focusedOptionIndex === optionIndex;

            return (
              <button
                key={`${currentQuestion.id || currentQuestion.question}_${option.id || option.label}`}
                type="button"
                onClick={() => {
                  if (isBusy || expired) return;
                  handleOptionClick(currentQuestion.question, option.label, currentQuestionIndex);
                  setFocusedOptionIndex(optionIndex);
                }}
                disabled={isBusy || expired}
                className={`w-full flex items-start gap-3 p-2 text-[13px] text-foreground rounded-md text-left transition-colors outline-none ${
                  focused ? 'bg-muted/70' : 'hover:bg-muted/50'
                } ${isBusy || expired ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div
                  className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-[10px] font-medium transition-colors mt-0.5 ${
                    selectedOption ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {optionIndex + 1}
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[13px] transition-colors font-medium text-foreground">{option.label}</span>
                  {option.description && (
                    <span className="text-[12px] text-muted-foreground">{option.description}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 px-2 py-2">
        <button
          type="button"
          onClick={onSkip}
          disabled={isBusy}
          className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          Skip All
        </button>
        <button
          type="button"
          onClick={handleContinue}
          disabled={
            isBusy
            || expired
            || hasCustomText
            || (isLastQuestion ? !allQuestionsAnswered : !currentQuestionHasAnswer)
          }
          className="h-6 text-xs px-3 rounded-md bg-primary/90 text-primary-foreground hover:bg-primary disabled:opacity-50 inline-flex items-center"
        >
          {isBusy ? 'Sending...' : isLastQuestion ? 'Submit' : 'Continue'}
          <CornerDownLeft className="w-3 h-3 ml-1 opacity-60" />
        </button>
      </div>
    </div>
  );
});

StudioAgentQuestionCard.displayName = 'StudioAgentQuestionCard';

export default StudioAgentQuestionCard;
