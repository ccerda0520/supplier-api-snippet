import { Global, Module } from '@nestjs/common';
import { ProductController } from '../controllers/product.controller';
import { ProductBatchProcessor } from '../processors/productBatch.processor';
import { SuppliedProductService } from '../services/suppliedProduct.service';
import { BatchService } from '../services/batch.service';
import { SuppliedProductSyncService } from '../services/product/suppliedProductSync.service';

@Global()
@Module({
  controllers: [ProductController],
  providers: [BatchService, SuppliedProductService, ProductBatchProcessor, SuppliedProductSyncService],
  exports: [BatchService, SuppliedProductService, ProductBatchProcessor, SuppliedProductSyncService],
})
export class ProductModule {}
