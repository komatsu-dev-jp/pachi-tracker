import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import WorkflowSection from "@/components/WorkflowSection";

export default async function DepartmentPage({
  params,
}: {
  params: { id: string };
}) {
  const department = await prisma.department.findUnique({
    where: { id: parseInt(params.id) },
    include: {
      workflows: {
        include: {
          steps: {
            orderBy: { order: "asc" },
          },
        },
        orderBy: { order: "asc" },
      },
    },
  });

  if (!department) {
    notFound();
  }

  const totalSteps = department.workflows.reduce(
    (acc, w) => acc + w.steps.length,
    0
  );
  const completedSteps = department.workflows.reduce(
    (acc, w) =>
      acc + w.steps.filter((s) => s.status === "completed").length,
    0
  );
  const inProgressSteps = department.workflows.reduce(
    (acc, w) =>
      acc + w.steps.filter((s) => s.status === "in_progress").length,
    0
  );

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-slate-500 mb-6">
        <Link href="/" className="hover:text-blue-600 transition-colors">
          ホーム
        </Link>
        <span>/</span>
        <Link href="/departments" className="hover:text-blue-600 transition-colors">
          部署一覧
        </Link>
        <span>/</span>
        <span className="text-slate-900 font-medium">{department.name}</span>
      </nav>

      {/* Department Header */}
      <div
        className="rounded-2xl p-8 mb-8 text-white"
        style={{ backgroundColor: department.color }}
      >
        <div className="flex items-center gap-4 mb-4">
          <span className="text-5xl">{department.icon}</span>
          <div>
            <h1 className="text-3xl font-bold">{department.name}</h1>
            <p className="text-white/80">{department.nameEn}</p>
          </div>
        </div>
        <p className="text-white/90 text-lg mb-6">{department.description}</p>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white/20 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold">{department.workflows.length}</div>
            <div className="text-sm text-white/80">ワークフロー</div>
          </div>
          <div className="bg-white/20 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold">{completedSteps}</div>
            <div className="text-sm text-white/80">完了ステップ</div>
          </div>
          <div className="bg-white/20 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold">{inProgressSteps}</div>
            <div className="text-sm text-white/80">進行中</div>
          </div>
        </div>
      </div>

      {/* Overall Progress */}
      {totalSteps > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-8">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-slate-900">全体の進捗</h2>
            <span className="text-sm text-slate-600">
              {completedSteps} / {totalSteps} ステップ完了
            </span>
          </div>
          <div className="bg-slate-100 rounded-full h-3">
            <div
              className="h-3 rounded-full transition-all"
              style={{
                width: `${Math.round((completedSteps / totalSteps) * 100)}%`,
                backgroundColor: department.color,
              }}
            />
          </div>
          <div className="mt-2 text-right text-sm font-medium" style={{ color: department.color }}>
            {Math.round((completedSteps / totalSteps) * 100)}%
          </div>
        </div>
      )}

      {/* Workflows */}
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-900">ワークフロー一覧</h2>
        {department.workflows.map((workflow) => (
          <WorkflowSection
            key={workflow.id}
            workflow={workflow}
            departmentColor={department.color}
          />
        ))}
      </div>
    </div>
  );
}
