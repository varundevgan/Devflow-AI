import { BadRequestException, Body, Controller, Post } from "@nestjs/common";

import { UserService } from "../users/users.service";
import { registerSchema } from "./register.schema";
import { loginSchema } from "./login.schema";

@Controller("auth")
export class AuthController {
  constructor(private readonly userService: UserService) {}

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
  async login(@Body() body: unknown) {
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((issue) => {
          const field = issue.path.join(".");
          return field.length > 0 ? `${field} : ${issue.message}` : issue.message;
        }),
      );
    }
    return this.userService.loginUser(parsed.data);
  }
}
