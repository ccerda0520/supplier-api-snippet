import { Module } from '@nestjs/common';
import { InformationController } from '../controllers/information.controller';

@Module({
  controllers: [InformationController],
})
export class InformationModule {}
