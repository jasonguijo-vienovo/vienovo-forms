import { auth } from "@/auth";

export default auth((req) => {
  const { pathname } = req.nextUrl;

  const isPublic =
    pathname === "/sign-in" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/icon" ||
    pathname.startsWith("/brand/") ||
    /\.[a-zA-Z0-9]+$/.test(pathname);

  if (!req.auth && !isPublic) {
    const url = new URL("/sign-in", req.url);
    url.searchParams.set("callbackUrl", pathname);
    return Response.redirect(url);
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|brand/).*)"],
};
