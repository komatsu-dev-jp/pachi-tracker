import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function HomePage() {
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

  const totalWorkflows = departments.reduce(
    (acc, d) => acc + d.workflows.length,
    0
  );
  const totalSteps = departments.reduce(
    (acc, d) =>
      acc + d.workflows.reduce((wAcc, w) => wAcc + w.steps.length, 0),
    0
  );

  return (
    <div>
      {/* Hero Section */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-slate-900 mb-4">
          🎰 Pachi Tracker
        </h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto">
          パチンコツール開発・販売会社の業務管理システム。
          各部署のワークフローを一元管理し、スムーズな業務遂行をサポートします。
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 text-center">
          <div className="text-4xl font-bold text-blue-600 mb-2">
            {departments.length}
          </div>
          <div className="text-slate-600">部署</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 text-center">
          <div className="text-4xl font-bold text-indigo-600 mb-2">
            {totalWorkflows}
          </div>
          <div className="text-slate-600">ワークフロー</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 text-center">
          <div className="text-4xl font-bold text-violet-600 mb-2">
            {totalSteps}
          </div>
          <div className="text-slate-600">ステップ</div>
        </div>
      </div>

      {/* Departments Grid */}
      <div className="mb-8 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">部署一覧</h2>
        <Link
          href="/departments"
          className="text-blue-600 hover:text-blue-800 text-sm font-medium transition-colors"
        >
          すべて見る →
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {departments.map((dept) => (
          <Link
            key={dept.id}
            href={`/departments/${dept.id}`}
            className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md hover:border-blue-300 transition-all group"
          >
            <div className="flex items-start gap-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                style={{ backgroundColor: `${dept.color}20` }}
              >
                {dept.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-slate-900 text-lg group-hover:text-blue-600 transition-colors">
                  {dept.name}
                </h3>
                <p className="text-xs text-slate-500 mb-2">{dept.nameEn}</p>
                <p className="text-sm text-slate-600 line-clamp-2">
                  {dept.description}
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-4 text-sm text-slate-500">
              <span
                className="font-medium"
                style={{ color: dept.color }}
              >
                {dept.workflows.length} ワークフロー
              </span>
              <span>
                {dept.workflows.reduce((acc, w) => acc + w.steps.length, 0)} ステップ
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
