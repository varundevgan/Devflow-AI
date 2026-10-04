import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { REFRESH_TOKEN_30_DAYS_EXPIRE, UserService } from "../users/users.service";
import { registerSchema } from "./register.schema";
import { loginSchema } from "./login.schema";
import { AppConfig } from "@/config/app-config";
import { ACCESS_TOKEN_COOKIE, ACCESS_TOKEN_EXPIRE, generateAccessToken } from "./access.token";
import { AccessTokenGuard, type AuthenticatedRequest } from "./access-token.guard";

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
          return field.length > 0 ? `${field} : ${issue.message}` : issue.message;
        }),
      );
    }

    const { user, refreshToken } = await this.userService.loginUser(parsed.data);
    const accessToken = generateAccessToken(user.id, this.appConfig.accessTokenSecret);

    response.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
      httpOnly: true,
      secure: this.appConfig.isProduction ? true : false,
      sameSite: "lax",
      path: "/",
      maxAge: ACCESS_TOKEN_EXPIRE,
    });

    response.cookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: this.appConfig.isProduction ? true : false,
      sameSite: "lax",
      path: "/",
      maxAge: REFRESH_TOKEN_30_DAYS_EXPIRE,
    });

    return user;
  }

  @UseGuards(AccessTokenGuard)
  @Get("me")
  me(@Req() request: AuthenticatedRequest): { userId: number } {
    const userId: number = request.userId;
    return { userId };
  }
}
