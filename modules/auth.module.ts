import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from '../controllers/auth.controller';
import config from '../../config';
import { AuthService } from '../services/auth.service';

@Module({
  providers: [AuthService],
  exports: [AuthService],
  controllers: [AuthController],
  imports: [
    JwtModule.register({
      global: true,
      secret: config.SUPPLIER_API_SECRET,
    }),
  ],
})
export class AuthModule {}
