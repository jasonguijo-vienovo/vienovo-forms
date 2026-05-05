import NextAuth, { type DefaultSession } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Credentials from "next-auth/providers/credentials";
import { connectMongo } from "@/lib/db/mongo";
import { User } from "@/models/User";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role?: "user" | "approver" | "processor" | "admin";
    } & DefaultSession["user"];
  }
}

const devBypass = process.env.AUTH_DEV_BYPASS === "1";

function configuredAdminEmails() {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

const providers = devBypass
  ? [
      Credentials({
        name: "Dev bypass",
        credentials: {
          email: { label: "Email", type: "email", placeholder: "you@vienovo.ph" },
        },
        authorize: async (creds) => {
          const email = String(creds?.email ?? "").trim().toLowerCase();
          if (!email.endsWith("@vienovo.ph")) return null;
          return {
            id: email,
            email,
            name: email.split("@")[0].replace(/[._]/g, " "),
          };
        },
      }),
    ]
  : [
      MicrosoftEntraID({
        clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
        clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
        issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
      }),
    ];

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers,
  session: { strategy: "jwt" },
  pages: { signIn: "/sign-in" },
  callbacks: {
    async signIn({ user }) {
      const email = user?.email?.toLowerCase() ?? "";
      if (!email.endsWith("@vienovo.ph")) return false;

      try {
        await connectMongo();
        const existing = await User.findOne({ email }).select({ role: 1 }).lean();
        await User.updateOne(
          { email },
          {
            $set: {
              name: user?.name ?? "",
              image: user?.image ?? "",
              lastSeenAt: new Date(),
            },
            $setOnInsert: {
              email,
              firstSeenAt: new Date(),
              role: configuredAdminEmails().has(email) ? "admin" : existing?.role ?? "user",
            },
          },
          { upsert: true },
        );
      } catch (error) {
        console.error("Auth user sync failed:", error);
      }

      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id ?? token.sub ?? "";
      }
      const email = String(user?.email ?? token.email ?? "").trim().toLowerCase();
      if (email) {
        try {
          await connectMongo();
          const doc = await User.findOne({ email }).select({ role: 1 }).lean();
          token.role = configuredAdminEmails().has(email)
            ? "admin"
            : doc?.role === "admin"
              ? "admin"
              : "user";
        } catch (error) {
          console.error("Auth role load failed:", error);
          token.role = configuredAdminEmails().has(email) ? "admin" : "user";
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) ?? token.sub ?? "";
        session.user.role =
          token.role === "admin"
            ? "admin"
            : token.role === "approver"
              ? "approver"
              : token.role === "processor"
                ? "processor"
                : "user";
      }
      return session;
    },
  },
});
