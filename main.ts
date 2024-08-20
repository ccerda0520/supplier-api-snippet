import { NestFactory } from '@nestjs/core';
import { AppModule } from './modules/app.module';

export async function bootstrapSupplierApi() {
  return NestFactory.create(AppModule);
}
