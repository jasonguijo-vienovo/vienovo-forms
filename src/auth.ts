import NextAuth, { type DefaultSession } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Credentials from "next-auth/providers/credentials";
import { connectMongo } from "@/lib/db/mongo";
import { isFirebaseAdminConfigured, verifyFirebaseIdToken } from "@/lib/firebase/admin";
import { User } from "@/models/User";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role?: "user" | "approver" | "processor" | "admin";
    } & DefaultSession["user"];
  }
}

const microsoftConfigured = Boolean(
  process.env.AUTH_MICROSOFT_ENTRA_ID_ID &&
    process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET &&
    process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
);
const firebaseConfigured = isFirebaseAdminConfigured();

function configuredAdminEmails() {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

const providers = [];

if (microsoftConfigured) {
  providers.push(
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
    }),
  );
}

if (firebaseConfigured) {
  providers.push(
    Credentials({
      id: "firebase",
      name: "Firebase",
      credentials: {
        idToken: { label: "ID token", type: "text" },
      },
      authorize: async (credentials) => {
        const idToken = String(credentials?.idToken ?? "").trim();
        if (!idToken) return null;

        try {
          const decodedToken = await verifyFirebaseIdToken(idToken);
          const email = String(decodedToken.email ?? "").trim().toLowerCase();
          if (!email.endsWith("@vienovo.ph")) return null;
          if (!decodedToken.email_verified) return null;

          return {
            id: decodedToken.uid,
            email,
            name: String(decodedToken.name ?? email.split("@")[0].replace(/[._]/g, " ")),
            image: String(decodedToken.picture ?? ""),
          };
        } catch (error) {
          console.error("Firebase token verification failed:", error);
          return null;
        }
      },
    }),
  );
}

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
