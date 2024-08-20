import { Module } from '@nestjs/common';
import { TasksService } from '../services/tasks.service';
import { SupplierProductCacheModule } from './suppliedProductCache.module';

@Module({
  providers: [TasksService],
  exports: [TasksService],
  imports: [SupplierProductCacheModule],
})
export class TasksModule {}
