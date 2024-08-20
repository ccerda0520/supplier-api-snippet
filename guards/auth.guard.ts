import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SupplierJwt, SupplierService } from '../services/supplier.service';
import { ApiError } from '../functions/helpers/error.helpers';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwtService: JwtService, private supplierService: SupplierService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authorization = request.headers.authorization;
    const token = authorization?.replace('Bearer ', '') as string;
    let authorized = false;
    let payload: SupplierJwt;

    if (token) {
      try {
        payload = await this.jwtService.verifyAsync(token);

        authorized = true;
      } catch (e) {
        // invalid token, not authorized
      }
    }

    if (!authorized) {
      throw new UnauthorizedException();
    }

    // Any controller or method using this guard will be given access to the supplier that was validated
    request.supplier = await this.supplierService.getSupplierById(payload.id);

    if (!request.supplier) {
      throw new ApiError({
        status: HttpStatus.BAD_REQUEST,
        message: `Supplier with id ${payload.id} not found.`,
      });
    }

    return authorized;
  }
}
