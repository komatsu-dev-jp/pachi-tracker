"use client";

import { useState } from "react";

type Step = {
  id: number;
  name: string;
  description: string;
  order: number;
  status: string;
  assignee: string | null;
  deadline: string | null;
};

type Workflow = {
  id: number;
  name: string;
  description: string;
  order: number;
  steps: Step[];
};

const statusConfig = {
  pending: {
    label: "未着手",
    className: "bg-slate-100 text-slate-600 border-slate-200",
    dot: "bg-slate-400",
  },
  in_progress: {
    label: "進行中",
    className: "bg-blue-50 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
  },
  completed: {
    label: "完了",
    className: "bg-green-50 text-green-700 border-green-200",
    dot: "bg-green-500",
  },
};

export default function WorkflowSection({
  workflow,
  departmentColor,
}: {
  workflow: Workflow;
  departmentColor: string;
}) {
  const [steps, setSteps] = useState<Step[]>(workflow.steps);
  const [isExpanded, setIsExpanded] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const completedCount = steps.filter((s) => s.status === "completed").length;
  const progressPercent = steps.length > 0
    ? Math.round((completedCount / steps.length) * 100)
    : 0;

  const cycleStatus = async (stepId: number, currentStatus: string) => {
    const nextStatus =
      currentStatus === "pending"
        ? "in_progress"
        : currentStatus === "in_progress"
        ? "completed"
        : "pending";

    setUpdatingId(stepId);
    try {
      const res = await fetch(`/api/steps/${stepId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (res.ok) {
        setSteps((prev) =>
          prev.map((s) =>
            s.id === stepId ? { ...s, status: nextStatus } : s
          )
        );
      }
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Workflow Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left p-6 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-lg font-bold text-slate-900 mb-1">
              {workflow.name}
            </h3>
            <p className="text-sm text-slate-600">{workflow.description}</p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="text-sm text-slate-500">
              {completedCount}/{steps.length}
            </span>
            <span className="text-slate-400">{isExpanded ? "▲" : "▼"}</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4 bg-slate-100 rounded-full h-2">
          <div
            className="h-2 rounded-full transition-all"
            style={{
              width: `${progressPercent}%`,
              backgroundColor: departmentColor,
            }}
          />
        </div>
      </button>

      {/* Steps */}
      {isExpanded && (
        <div className="border-t border-slate-100 p-6 pt-4">
          <div className="relative">
            {/* Vertical connector line */}
            <div className="absolute left-5 top-6 bottom-6 w-0.5 bg-slate-200" />

            <div className="space-y-4">
              {steps.map((step, idx) => {
                const config =
                  statusConfig[step.status as keyof typeof statusConfig] ||
                  statusConfig.pending;

                return (
                  <div key={step.id} className="flex items-start gap-4 relative">
                    {/* Step number circle */}
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 z-10 border-2 ${
                        step.status === "completed"
                          ? "bg-green-500 text-white border-green-500"
                          : step.status === "in_progress"
                          ? "bg-blue-500 text-white border-blue-500"
                          : "bg-white text-slate-500 border-slate-300"
                      }`}
                    >
                      {step.status === "completed" ? "✓" : idx + 1}
                    </div>

                    {/* Step content */}
                    <div className="flex-1 bg-slate-50 rounded-xl p-4 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h4 className="font-semibold text-slate-900">
                          {step.name}
                        </h4>
                        <button
                          onClick={() => cycleStatus(step.id, step.status)}
                          disabled={updatingId === step.id}
                          className={`text-xs px-3 py-1 rounded-full border font-medium whitespace-nowrap flex-shrink-0 hover:opacity-80 transition-opacity cursor-pointer ${config.className}`}
                        >
                          <span
                            className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${config.dot}`}
                          />
                          {updatingId === step.id ? "..." : config.label}
                        </button>
                      </div>
                      <p className="text-sm text-slate-600 mb-3">
                        {step.description}
                      </p>
                      <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                        {step.assignee && (
                          <span className="flex items-center gap-1">
                            <span>👤</span>
                            <span>{step.assignee}</span>
                          </span>
                        )}
                        {step.deadline && (
                          <span className="flex items-center gap-1">
                            <span>⏰</span>
                            <span>{step.deadline}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
