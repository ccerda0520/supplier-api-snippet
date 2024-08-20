import { Global, Module } from '@nestjs/common';
import { SupplierService } from '../services/supplier.service';
import { SupplierController } from '../controllers/supplier.controller';
import { TasksModule } from './tasks.module';

@Global()
@Module({
  controllers: [SupplierController],
  providers: [SupplierService],
  exports: [SupplierService],
  imports: [TasksModule],
})
export class SupplierModule {}
