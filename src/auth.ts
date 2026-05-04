import NextAuth, { type DefaultSession } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Credentials from "next-auth/providers/credentials";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role?: "user" | "approver" | "processor" | "admin";
    } & DefaultSession["user"];
  }
}

const devBypass = process.env.AUTH_DEV_BYPASS === "1";

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
      return email.endsWith("@vienovo.ph");
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id ?? token.sub ?? "";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) ?? token.sub ?? "";
      }
      return session;
    },
  },
});
