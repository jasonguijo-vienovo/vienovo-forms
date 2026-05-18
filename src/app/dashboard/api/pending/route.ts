import { NextRequest, NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { fetchPendingApprovals } from "../../actions";

export async function GET(req: NextRequest) {
  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userEmail = session.user.email.toLowerCase();
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("query") || "";
  const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1);
  const data = await fetchPendingApprovals(userEmail, query, page);
  return NextResponse.json(data);
}
