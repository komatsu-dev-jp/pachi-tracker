import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = await request.json();
  const { status } = body;

  if (!["pending", "in_progress", "completed"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const step = await prisma.step.update({
    where: { id: parseInt(params.id) },
    data: { status },
  });

  return NextResponse.json(step);
}
