import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";

import { AppConfig } from "@/config/app-config";
import { ACCESS_TOKEN_COOKIE, InvalidAccessTokenError, verifyAccessToken } from "./access.token";

export type AuthenticatedRequest = Request & {
  userId: string;
};

const INVALID_ACCESS_TOKEN_MESSAGE = "Invalid or missing access token";

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly appConfig: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.cookies?.[ACCESS_TOKEN_COOKIE];

    if (typeof token !== "string" || token.length === 0) {
      throw new UnauthorizedException(INVALID_ACCESS_TOKEN_MESSAGE);
    }

    try {
      const { userId } = verifyAccessToken(token, this.appConfig.accessTokenSecret);
      (request as AuthenticatedRequest).userId = userId;
      return true;
    } catch (error) {
      // verifyAccessToken throws InvalidAccessTokenError for a bad signature, a
      // bad shape, and expiry. Anything else is a bug and must stay a 500.
      if (error instanceof InvalidAccessTokenError) {
        throw new UnauthorizedException(INVALID_ACCESS_TOKEN_MESSAGE);
      }
      throw error;
    }
  }
}
