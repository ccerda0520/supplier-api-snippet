import { Injectable } from '@nestjs/common';
import { BatchService } from './batch.service';
import { SupplierService, SupplierType } from './supplier.service';
import { fromBatchDbToApi } from '../functions/mappers/batch.mappers';
import { Prisma } from 'commons-ephesus/generated/client';
import { ProductBatchProcessor } from '../processors/productBatch.processor';
import { SupplierProductCacheService } from './supplierProductCache.service';
import { fromEdiSupplierProductToUpsertApiBatch } from '../functions/mappers/supplierProductCache.mappers';
import { BatchResult, BatchUpsertBody } from 'commons-ephesus/schemas/batch.schema';
import { LoggerService } from './logger.service';
import { LogLevel } from 'commons-ephesus/utils/cloudWatch';

@Injectable()
export class TasksService {
  constructor(
    private batchService: BatchService,
    private supplierService: SupplierService,
    private productBatchProcessor: ProductBatchProcessor,
    private supplierProductCacheService: SupplierProductCacheService,
    private loggerService: LoggerService,
  ) {}

  async supplierProductCacheSync(supplier: SupplierType) {
    if (!supplier.config?.productsSyncSettings?.spcSyncEnabled) {
      return;
    }

    const supplierCode = supplier.name.toLowerCase().replace(/\W+/g, '-');
    const spcSupplier = await this.supplierProductCacheService.getSupplierBySupplierCode(supplierCode);
    // supplier doesnt exist in supplier product cache
    if (!spcSupplier) {
      return;
    }

    // supplier product cache doesn't have any products synced yet
    if (!spcSupplier.productCacheSync?.latestSyncTimestamp) {
      return;
    }
    const spcLatestProductsSyncDate = new Date(spcSupplier.productCacheSync?.latestSyncTimestamp);
    if (supplier.config?.latestProductsSyncTimeStamp) {
      const supplierLatestProductsSyncDate = new Date(supplier.config?.latestProductsSyncTimeStamp || '');

      // our data is already up-to-date with supplier product cache data
      if (supplierLatestProductsSyncDate >= spcLatestProductsSyncDate) {
        return;
      }
    }

    const spcProducts = await this.supplierProductCacheService.getProductsBySupplierCode(supplierCode);
    let batch: BatchUpsertBody;
    switch (supplier.platform?.toLowerCase()) {
      case 'edi':
        batch = fromEdiSupplierProductToUpsertApiBatch(spcProducts, spcLatestProductsSyncDate);
        break;
      default:
        break;
    }

    // Non EDI batches not handled right now
    if (!batch) {
      return;
    }
    const preprocessResult = await this.productBatchProcessor.preprocess(supplier, batch);
    const { valid, async, batchId } = preprocessResult;
    let batchResult: BatchResult = preprocessResult.batchResult;

    if (!valid) {
      await this.loggerService.log(
        `Product batch preprocessing failed: ${JSON.stringify(batchResult, null, 2)}`,
        LogLevel.INFO,
      );
      return;
    }

    if (async) {
      await this.loggerService.log(
        `Product batch ${batchId} created in async mode, will be processed during cron`,
        LogLevel.INFO,
      );
      return;
    }

    try {
      batchResult = await this.productBatchProcessor.process(batchId, supplier, batchResult);
    } catch (e) {
      batchResult.status = 'ERROR';
      batchResult.customData.message = `Internal Error: ${e.message}`;

      await this.batchService.updateBatch(batchId, {
        status: 'ERROR',
        result: batchResult as Record<string, any>,
      });
      await this.loggerService.log(`Error while processing batch ${e.message}`, LogLevel.ERROR, e.stack);
    }
  }
}
