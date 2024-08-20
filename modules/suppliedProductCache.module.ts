import { Module } from '@nestjs/common';
import { SupplierProductCacheService } from '../services/supplierProductCache.service';

@Module({
  providers: [SupplierProductCacheService],
  exports: [SupplierProductCacheService],
})
export class SupplierProductCacheModule {}
