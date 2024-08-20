import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import config from '../../config';

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authorization = request.headers.authorization;
    const token = authorization?.replace('Bearer ', '') as string;

    if (!token) {
      return false;
    }

    try {
      const decoded = await this.jwtService.verifyAsync(token, {
        secret: config.SERVICE_SECRET_KEY,
      });
      if (!decoded?.tokenCreatedAt) {
        return false;
      }
    } catch (error) {
      console.error(error);
      return false;
    }

    return true;
  }
}
