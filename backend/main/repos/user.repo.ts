import { prisma } from "../../lib/db";
import type { PublicUser, UserProfile } from "../types";

export interface UserAuthRow {
  id: string;
  username: string;
  passwordHash: string;
}

export interface ProfileUpdateData {
  email?: string | null;
  displayName?: string | null;
}

export interface IUserRepo {
  findById(id: string): Promise<UserProfile | null>;
  findByUsername(username: string): Promise<UserAuthRow | null>;
  findCredentialsById(id: string): Promise<UserAuthRow | null>;
  findEmailById(id: string): Promise<string | null>;
  findUsernameById(id: string): Promise<string | null>;
  create(username: string, passwordHash: string): Promise<PublicUser>;
  updateProfile(userId: string, data: ProfileUpdateData): Promise<UserProfile>;
  updatePasswordHash(userId: string, newHash: string): Promise<void>;
  softDeleteProfile(userId: string): Promise<void>;
  hardDelete(userId: string): Promise<void>;
}

const PROFILE_SELECT = {
  id: true,
  username: true,
  email: true,
  displayName: true,
  createdAt: true,
} as const;

class UserRepoImpl implements IUserRepo {
  async findById(id: string): Promise<UserProfile | null> {
    return prisma.user.findUnique({ where: { id }, select: PROFILE_SELECT });
  }

  async findByUsername(username: string): Promise<UserAuthRow | null> {
    return prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true, passwordHash: true },
    });
  }

  async findCredentialsById(id: string): Promise<UserAuthRow | null> {
    return prisma.user.findUnique({
      where: { id },
      select: { id: true, username: true, passwordHash: true },
    });
  }

  async findEmailById(id: string): Promise<string | null> {
    const row = await prisma.user.findUnique({ where: { id }, select: { email: true } });
    return row?.email ?? null;
  }

  async findUsernameById(id: string): Promise<string | null> {
    const row = await prisma.user.findUnique({ where: { id }, select: { username: true } });
    return row?.username ?? null;
  }

  async create(username: string, passwordHash: string): Promise<PublicUser> {
    return prisma.user.create({
      data: { username, passwordHash },
      select: { id: true, username: true, createdAt: true },
    });
  }

  async updateProfile(userId: string, data: ProfileUpdateData): Promise<UserProfile> {
    return prisma.user.update({ where: { id: userId }, data, select: PROFILE_SELECT });
  }

  async updatePasswordHash(userId: string, newHash: string): Promise<void> {
    await prisma.user.update({ where: { id: userId }, data: { passwordHash: newHash } });
  }

  async softDeleteProfile(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { email: null, displayName: null, deletedAt: new Date() },
    });
  }

  async hardDelete(userId: string): Promise<void> {
    await prisma.user.delete({ where: { id: userId } });
  }
}

export const userRepo: IUserRepo = new UserRepoImpl();
