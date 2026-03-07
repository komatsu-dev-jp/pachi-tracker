import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function DepartmentsPage() {
  const departments = await prisma.department.findMany({
    include: {
      workflows: {
        include: {
          steps: true,
        },
      },
    },
    orderBy: { id: "asc" },
  });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">部署一覧</h1>
        <p className="text-slate-600">
          全 {departments.length} 部署のワークフローを管理します
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {departments.map((dept) => {
          const totalSteps = dept.workflows.reduce(
            (acc, w) => acc + w.steps.length,
            0
          );
          const completedSteps = dept.workflows.reduce(
            (acc, w) =>
              acc + w.steps.filter((s) => s.status === "completed").length,
            0
          );
          const progressPercent =
            totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

          return (
            <Link
              key={dept.id}
              href={`/departments/${dept.id}`}
              className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md hover:border-blue-300 transition-all group"
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center text-3xl flex-shrink-0"
                  style={{ backgroundColor: `${dept.color}20` }}
                >
                  {dept.icon}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <h2 className="text-xl font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                      {dept.name}
                      <span className="ml-2 text-sm font-normal text-slate-500">
                        {dept.nameEn}
                      </span>
                    </h2>
                    <span className="text-sm text-slate-500">
                      {dept.workflows.length} ワークフロー
                    </span>
                  </div>
                  <p className="text-slate-600 mb-4">{dept.description}</p>

                  {/* Workflow list */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {dept.workflows.map((wf) => (
                      <span
                        key={wf.id}
                        className="text-xs px-3 py-1 rounded-full border"
                        style={{
                          borderColor: `${dept.color}40`,
                          color: dept.color,
                          backgroundColor: `${dept.color}10`,
                        }}
                      >
                        {wf.name}
                      </span>
                    ))}
                  </div>

                  {/* Progress */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-slate-100 rounded-full h-2">
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{
                          width: `${progressPercent}%`,
                          backgroundColor: dept.color,
                        }}
                      />
                    </div>
                    <span className="text-xs text-slate-500 whitespace-nowrap">
                      {completedSteps}/{totalSteps} 完了
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
