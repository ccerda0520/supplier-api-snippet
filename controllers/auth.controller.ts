import {
  nestControllerContract,
  NestControllerInterface,
  NestRequestShapes,
  TsRest,
  TsRestRequest,
} from '@ts-rest/nest';
import { Controller } from '@nestjs/common';
import { authContract } from 'commons-ephesus/contracts/supplier-api/auth.contract';
import { PrismaService } from '../services/prisma.service';
import config from '../../config';
import { AuthService } from '../services/auth.service';

const contract = nestControllerContract(authContract);

type RequestShapes = NestRequestShapes<typeof contract>;

@Controller('auth')
export class AuthController implements NestControllerInterface<typeof contract> {
  constructor(private prismaService: PrismaService, private authService: AuthService) {}

  @TsRest(contract.postAuth)
  async postAuth(@TsRestRequest() { body }: RequestShapes['postAuth']) {
    const { supplierId, secret } = body;

    let token: string;

    try {
      token = await this.authService.getToken(supplierId, secret);
    } catch (e) {
      return {
        status: 400 as const,
        body: {
          message: e.message,
        },
      };
    }

    return {
      status: 200 as const,
      body: {
        token,
      },
    };
  }
}
