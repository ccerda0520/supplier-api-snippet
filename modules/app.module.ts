import { Module } from '@nestjs/common';
import { ProductModule } from './product.module';
import { DatabaseModule } from './database.module';
import { AuthModule } from './auth.module';
import { TasksModule } from './tasks.module';
import { SupplierModule } from './supplier.module';
import { LoggerModule } from './logger.module';
import { SupplierProductCacheModule } from './suppliedProductCache.module';
import { AdminModule } from './admin.module';
import { InventoryModule } from './inventory.module';
import { InformationModule } from './information.module';
import { PusherModule } from './pusher.module';
@Module({
  imports: [
    InformationModule,
    AuthModule,
    DatabaseModule,
    LoggerModule,
    SupplierModule,
    ProductModule,
    InventoryModule,
    SupplierProductCacheModule,
    TasksModule,
    AdminModule,
    PusherModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
