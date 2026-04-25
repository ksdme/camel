import { Prisma, PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export { Prisma };

// Injectable DB client type — satisfied by both PrismaClient and Prisma transaction clients.
// Use this as the constructor parameter in repositories so they can be tested with mocks
// and composed inside prisma.$transaction(async (tx) => { ... }) calls.
export type DbClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;
