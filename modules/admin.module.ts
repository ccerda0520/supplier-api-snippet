import { Module, Global } from '@nestjs/common';
import { AdminController } from '../controllers/admin.controller';
import { TasksModule } from './tasks.module';

@Global()
@Module({
  controllers: [AdminController],
  imports: [TasksModule],
})
export class AdminModule {}
