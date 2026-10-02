import { argon2, randomBytes, timingSafeEqual } from "node:crypto";

import { PrismaService } from "@/infra/prisma/prisma.service";
import { Prisma } from "@devflow/db";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";

// OWASP's Argon2id minimum: 19 MiB, 2 passes, parallelism 1.
// `memory` is kibibytes. Node has no version argument; v=19 is Argon2 1.3.
const ARGON2_MEMORY_KIB = 19 * 1024;
const ARGON2_PASSES = 2;
const ARGON2_PARALLELISM = 1;
const ARGON2_TAG_LENGTH = 32;

// Not a user's password. Login runs Argon2 against this when the email is
// unknown, so that path takes about as long as a real verification.
const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$qgXCIahcGNT20KGCNv2o/Q$dlfK0vIVvU8Ouxk6uBkuML5EGmDuZ15Nsvq11ELNKTY";

export interface RegisterUserInput {
  name: string;
  email: string;
  password: string;
}

export interface RegisteredUser {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface LoginUserInput {
  password: string;
  email: string;
}

export interface LoginUser {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async registerUser(input: RegisterUserInput): Promise<RegisteredUser> {
    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();

    if (name.length === 0) {
      throw new BadRequestException("Name is required");
    }
    if (email.length === 0) {
      throw new BadRequestException("Email is required");
    }
    if (input.password.length === 0) {
      throw new BadRequestException("Password is required");
    }

    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException("User already exists");
    }

    const passwordHash = await hashPassword(input.password);

    try {
      return await this.prisma.user.create({
        data: { name, email, passwordHash },
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("User already exists");
      }
      throw error;
    }
  }

  async loginUser(input: LoginUserInput): Promise<LoginUser> {
    const email = input.email.trim().toLowerCase();

    if (email.length === 0) {
      throw new BadRequestException("Email is required");
    }
    if (input.password.length === 0) {
      throw new BadRequestException("Password is required");
    }

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const passwordMatches = await verifyPassword(
      input.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (user === null || !passwordMatches) {
      throw new UnauthorizedException("Invalid email or password");
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}

function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);

  return new Promise((resolve, reject) => {
    argon2(
      "argon2id",
      {
        message: password,
        nonce: salt,
        parallelism: ARGON2_PARALLELISM,
        tagLength: ARGON2_TAG_LENGTH,
        memory: ARGON2_MEMORY_KIB,
        passes: ARGON2_PASSES,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(encodeArgon2Hash(salt, derivedKey));
      },
    );
  });
}

function encodeArgon2Hash(salt: Buffer, derivedKey: Buffer): string {
  const params = `m=${ARGON2_MEMORY_KIB},t=${ARGON2_PASSES},p=${ARGON2_PARALLELISM}`;
  return `$argon2id$v=19$${params}$${toPhcBase64(salt)}$${toPhcBase64(derivedKey)}`;
}

function toPhcBase64(value: Buffer): string {
  return value.toString("base64").replace(/=+$/u, "");
}

function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parsed = parseArgon2Hash(storedHash);
  if (parsed === null) {
    return Promise.resolve(false);
  }

  return new Promise((resolve, reject) => {
    argon2(
      "argon2id",
      {
        message: password,
        nonce: parsed.salt,
        parallelism: parsed.parallelism,
        tagLength: parsed.tag.length,
        memory: parsed.memory,
        passes: parsed.passes,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        if (derivedKey.length !== parsed.tag.length) {
          resolve(false);
          return;
        }
        resolve(timingSafeEqual(derivedKey, parsed.tag));
      },
    );
  });
}

function parseArgon2Hash(storedHash: string): {
  memory: number;
  passes: number;
  parallelism: number;
  salt: Buffer;
  tag: Buffer;
} | null {
  const parts = storedHash.split("$");
  if (parts.length !== 6 || parts[1] !== "argon2id" || parts[2] !== "v=19") {
    return null;
  }

  const memory = readArgon2Param(parts[3] ?? "", "m");
  const passes = readArgon2Param(parts[3] ?? "", "t");
  const parallelism = readArgon2Param(parts[3] ?? "", "p");
  const salt = fromPhcBase64(parts[4] ?? "");
  const tag = fromPhcBase64(parts[5] ?? "");
  if (
    memory === null ||
    passes === null ||
    parallelism === null ||
    salt === null ||
    tag === null ||
    salt.length === 0 ||
    tag.length === 0
  ) {
    return null;
  }

  return { memory, passes, parallelism, salt, tag };
}

function readArgon2Param(params: string, name: string): number | null {
  const pair = params.split(",").find((item) => item.startsWith(`${name}=`));
  if (pair === undefined) {
    return null;
  }
  const value = Number(pair.slice(name.length + 1));
  if (!Number.isInteger(value) || value < 1) {
    return null;
  }
  return value;
}

function fromPhcBase64(value: string): Buffer | null {
  if (value.length === 0 || value.length % 4 === 1) {
    return null;
  }
  const padding = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
  const decoded = Buffer.from(value + padding, "base64");
  if (toPhcBase64(decoded) !== value) {
    return null;
  }
  return decoded;
}
