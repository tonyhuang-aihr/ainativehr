import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { HeadcountRole } from "@/lib/headcount/authz";
import { getDb } from "@/lib/headcount/db/client";
import { findUserByUsername, markLoginFailure, markLoginSuccess, userDepartmentIds } from "@/lib/headcount/db/mutate";
import { authSecret } from "@/lib/headcount/env";
import { lockActive, nextLock, verifyPassword } from "@/lib/headcount/password";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: authSecret(),
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: "/headcount/login" },
  providers: [
    Credentials({
      credentials: {
        username: { label: "用户名" },
        password: { label: "密码", type: "password" },
      },
      async authorize(credentials) {
        const username = String(credentials?.username ?? "").trim();
        const password = String(credentials?.password ?? "");
        if (!username || !password) return null;
        const db = await getDb();
        const row = await findUserByUsername(db, username);
        if (!row || row.status !== "active") return null;
        if (lockActive(row.lockedUntil, Date.now())) return null;
        const ok = await verifyPassword(password, row.passwordHash);
        if (!ok) {
          const next = nextLock(row.failedAttempts, Date.now());
          await markLoginFailure(db, row.id, next.failures, next.lockedUntil);
          return null;
        }
        await markLoginSuccess(db, row.id, row.name);
        return {
          id: row.id,
          name: row.name,
          role: row.role as HeadcountRole,
          departmentIds: await userDepartmentIds(db, row.id),
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        const account = user as { role?: HeadcountRole; departmentIds?: string[] };
        token.role = account.role;
        token.departmentIds = account.departmentIds ?? [];
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub ?? "";
      session.user.role = (token.role ?? "leader") as HeadcountRole;
      session.user.departmentIds = Array.isArray(token.departmentIds) ? token.departmentIds : [];
      return session;
    },
  },
});
