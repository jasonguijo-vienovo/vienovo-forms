import { redirect } from "next/navigation";
import { safeAuth } from "@/lib/safe-auth";

export default async function HomePage() {
  const session = await safeAuth();
  redirect(session?.user ? "/dashboard" : "/sign-in");
}
