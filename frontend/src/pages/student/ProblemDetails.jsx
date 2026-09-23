import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import Loader from "../../components/common/Loader";
import Button from "../../components/common/Button";
import ProblemDescription from "../../components/problem/ProblemDescription";
import CodeEditor from "../../components/problem/CodeEditor";
import AIEvaluationResult from "../../components/problem/AIEvaluationResult";
import StreakCelebrationModal from "../../components/problem/StreakCelebrationModal";

import { getProblemById } from "../../services/problemService";
import { submitCode, getMySubmissions } from "../../services/submissionService";
import { CheckCircle2 } from "lucide-react";

const DEFAULT_BOILERPLATE = `#include <stdio.h>

int main() {

    return 0;
}`;

const ProblemDetails = () => {
  const { id } = useParams();

  const [problem, setProblem] = useState(null);
  const [code, setCode] = useState(DEFAULT_BOILERPLATE);
  const [hasPreviousSubmission, setHasPreviousSubmission] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [evaluationResult, setEvaluationResult] = useState(null);
  const [allPassed, setAllPassed] = useState(false);
  const [progress, setProgress] = useState(null);
  const [showStreakModal, setShowStreakModal] = useState(false);

  useEffect(() => {
    const loadProblem = async () => {
      try {
        const data = await getProblemById(id);
        setProblem(data.problem);

        // Load previously submitted code if available
        if (data.lastSubmission) {
          if (data.lastSubmission.code) {
            setCode(data.lastSubmission.code);
            setHasPreviousSubmission(true);
          }
          if (data.lastSubmission.aiEvaluation) {
            setEvaluationResult(data.lastSubmission.aiEvaluation);
          }
          if (data.lastSubmission.allPassed !== undefined) {
            setAllPassed(data.lastSubmission.allPassed);
          } else if (data.problem?.isSolved) {
            setAllPassed(true);
          }
        } else if (data.problem?.isSolved) {
          // Fallback: check my submissions for this problem
          try {
            const subData = await getMySubmissions();
            const matchingSub = subData.submissions?.find(
              (s) =>
                s.problem?._id?.toString() === id ||
                s.problem?.toString() === id
            );
            if (matchingSub && matchingSub.code) {
              setCode(matchingSub.code);
              setHasPreviousSubmission(true);
              if (matchingSub.aiEvaluation) {
                setEvaluationResult(matchingSub.aiEvaluation);
              }
              setAllPassed(matchingSub.status === "accepted");
            }
          } catch (subErr) {
            console.error("Error fetching submission fallback:", subErr);
          }
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    loadProblem();
  }, [id]);

  const handleSubmit = async () => {
    if (!code || !code.trim() || submitting) return;

    try {
      setSubmitting(true);
      setMessage("");

      const data = await submitCode({
        problemId: id,
        code,
        language: "c",
      });

      if (data.aiEvaluation) {
        setEvaluationResult(data.aiEvaluation);
      }

      if (data.allPassed !== undefined) {
        setAllPassed(data.allPassed);
        if (data.allPassed) {
          setShowStreakModal(true);
          setProblem((prev) => (prev ? { ...prev, isSolved: true } : prev));
          setHasPreviousSubmission(true);
        }
      }

      if (data.progress) {
        setProgress(data.progress);
      }

      setMessage(data.message || "");
    } catch (error) {
      setMessage(
        error.response?.data?.message ||
          "Submission failed. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <Loader />;
  }

  if (!problem) {
    return (
      <div className="rounded-xl bg-red-50 p-5 text-red-600">
        Problem not found.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="grid gap-6 xl:grid-cols-2">
        {/* Problem Description */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-7 shadow-sm">
          <ProblemDescription problem={problem} />
        </div>

        {/* Code Editor & AI Evaluation */}
        <div className="space-y-4">
          {hasPreviousSubmission && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs text-emerald-800">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                <span>
                  <strong>{problem.isSolved ? "Solved Problem ✓" : "Previous Submission"}</strong> &mdash; Your submitted code and test results are loaded below.
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCode(DEFAULT_BOILERPLATE);
                  setHasPreviousSubmission(false);
                }}
                className="text-xs text-slate-500 hover:text-slate-800 underline shrink-0 font-medium text-left sm:text-right"
              >
                Clear &amp; Start Fresh
              </button>
            </div>
          )}

          <CodeEditor
            code={code}
            setCode={setCode}
            hasLoadedSubmission={hasPreviousSubmission}
            isSolved={Boolean(problem.isSolved)}
            onResetCode={() => {
              setCode(DEFAULT_BOILERPLATE);
              setHasPreviousSubmission(false);
            }}
          />

          {message && !evaluationResult && (
            <div className="rounded-xl bg-red-50 p-4 text-sm font-medium text-red-700 border border-red-200">
              {message}
            </div>
          )}

          <Button
            onClick={handleSubmit}
            disabled={submitting || !code.trim()}
            className="w-full"
          >
            {submitting
              ? "Analyzing..."
              : hasPreviousSubmission
              ? "Re-submit Code"
              : "Submit Code"}
          </Button>

          {/* AI Static Evaluation Result */}
          {evaluationResult && (
            <div className="mt-4">
              <AIEvaluationResult
                evaluation={evaluationResult}
                allPassed={allPassed}
                progress={progress}
              />
            </div>
          )}
        </div>
      </div>

      {/* Unique Streak Celebration Card Modal */}
      <StreakCelebrationModal
        isOpen={showStreakModal}
        onClose={() => setShowStreakModal(false)}
        streak={progress?.currentStreak || 1}
        longestStreak={progress?.longestStreak || 1}
        totalSolved={progress?.totalSolved || 1}
      />
    </div>
  );
};

export default ProblemDetails;