import type { HeadcountRole } from "@/lib/headcount/authz";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role: HeadcountRole;
    departmentIds: string[];
  }

  interface Session {
    user: {
      id: string;
      role: HeadcountRole;
      departmentIds: string[];
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: HeadcountRole;
    departmentIds?: string[];
  }
}
