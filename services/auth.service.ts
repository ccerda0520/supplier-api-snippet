import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { JwtService } from '@nestjs/jwt';
import config from '../../config';
import { SupplierJwt } from './supplier.service';
import { ApiError } from '../functions/helpers/error.helpers';

@Injectable()
export class AuthService {
  constructor(private prismaService: PrismaService, private jwtService: JwtService) {}

  async getToken(supplierId: string, secret: string) {
    const supplier = await this.prismaService.vendor.findFirst({ where: { id: supplierId } });

    if (!supplier) {
      throw new ApiError({
        status: HttpStatus.BAD_REQUEST,
        message: `No supplier found with id ${supplierId}`,
      });
    }

    if (secret !== config.SUPPLIER_API_SECRET) {
      throw new ApiError({
        status: HttpStatus.BAD_REQUEST,
        message: 'Invalid secret',
      });
    }

    const tokenBody: SupplierJwt = {
      id: supplier.id,
    };

    return await this.jwtService.signAsync(tokenBody, { noTimestamp: true });
  }
}
