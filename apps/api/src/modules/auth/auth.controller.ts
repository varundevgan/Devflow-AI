import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import {
  INVALID_REFRESH_TOKEN_MESSAGE,
  REFRESH_TOKEN_30_DAYS_EXPIRE,
  UserService,
} from "../users/users.service";
import { registerSchema } from "./register.schema";
import { loginSchema } from "./login.schema";
import { AppConfig } from "@/config/app-config";
import { ACCESS_TOKEN_COOKIE, ACCESS_TOKEN_EXPIRE, generateAccessToken } from "./access.token";
import { AccessTokenGuard, type AuthenticatedRequest } from "./access-token.guard";

export const REFRESH_TOKEN_COOKIE = "refresh_token";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly userService: UserService,
    private readonly appConfig: AppConfig,
  ) {}

  @Post("register")
  async register(@Body() body: unknown) {
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((issue) => {
          const field = issue.path.join(".");
          return field.length > 0 ? `${field}: ${issue.message}` : issue.message;
        }),
      );
    }
    return this.userService.registerUser(parsed.data);
  }

  @Post("login")
  async login(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((issue) => {
          const field = issue.path.join(".");
          return field.length > 0 ? `${field}: ${issue.message}` : issue.message;
        }),
      );
    }

    const { user, refreshToken } = await this.userService.loginUser(parsed.data);
    this.setAuthCookies(response, user.id, refreshToken);

    return user;
  }

  @UseGuards(AccessTokenGuard)
  @Get("me")
  me(@Req() request: AuthenticatedRequest): { userId: string } {
    return { userId: request.userId };
  }

  @Post("refresh")
  @HttpCode(HttpStatus.NO_CONTENT)
  async refreshToken(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const token = request.cookies?.[REFRESH_TOKEN_COOKIE];

    if (typeof token !== "string" || token.length === 0) {
      throw new UnauthorizedException(INVALID_REFRESH_TOKEN_MESSAGE);
    }

    const { refreshToken, userId } = await this.userService.rotateRefreshToken(token);
    this.setAuthCookies(response, userId, refreshToken);
  }

  private setAuthCookies(response: Response, userId: string, refreshToken: string): void {
    const cookieOptions = {
      httpOnly: true,
      secure: this.appConfig.isProduction,
      sameSite: "lax",
      path: "/",
    } as const;

    response.cookie(
      ACCESS_TOKEN_COOKIE,
      generateAccessToken(userId, this.appConfig.accessTokenSecret),
      { ...cookieOptions, maxAge: ACCESS_TOKEN_EXPIRE },
    );
    response.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
      ...cookieOptions,
      maxAge: REFRESH_TOKEN_30_DAYS_EXPIRE,
    });
  }
}
