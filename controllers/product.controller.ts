import { Controller, Req, UseGuards } from '@nestjs/common';
import {
  nestControllerContract,
  NestControllerInterface,
  NestRequestShapes,
  TsRest,
  TsRestRequest,
} from '@ts-rest/nest';
import { productContract } from 'commons-ephesus/contracts/supplier-api/product.contract';
import { BatchResult } from 'commons-ephesus/schemas/batch.schema';
import { SupplierService, SupplierType } from '../services/supplier.service';
import { ProductBatchProcessor } from '../processors/productBatch.processor';
import { BatchService } from '../services/batch.service';
import { Request } from 'express';
import { getPagination } from '../functions/helpers/controller.helpers';
import { fromBatchDbToApi } from '../functions/mappers/batch.mappers';
import { AuthGuard } from '../guards/auth.guard';

const contract = nestControllerContract(productContract);

type RequestShapes = NestRequestShapes<typeof contract>;

@Controller('products')
@UseGuards(AuthGuard)
export class ProductController implements NestControllerInterface<typeof contract> {
  constructor(
    private readonly batchService: BatchService,
    private readonly supplierService: SupplierService,
    private productBatchProcessor: ProductBatchProcessor,
  ) {}
  @TsRest(contract.getUpsertBatches)
  async getUpsertBatches(
    @TsRestRequest() { query }: RequestShapes['getUpsertBatches'],
    @Req() req: Request & { supplier: SupplierType },
  ) {
    const page_size = query.page_size ?? 250;
    const page_index = Number(query.page_index) || 0;
    const { rows, count } = await this.batchService.getBatches(
      {
        ...query,
        page_size,
        page_index,
      },
      req.supplier.id,
    );

    const pagination = getPagination(req, {
      count,
      page_index,
      page_size,
    });

    const batches = rows.map((row) => fromBatchDbToApi(row));

    return {
      status: 200 as const,
      body: {
        batches,
        pagination,
      },
    };
  }

  @TsRest(contract.getUpsertBatch)
  async getUpsertBatch(
    @TsRestRequest()
    { params: { id } }: RequestShapes['getUpsertBatch'],
    @Req() { supplier }: Request & { supplier: SupplierType },
  ) {
    try {
      const batch = await this.batchService.getBatch(id, supplier.id);

      return {
        status: 200 as const,
        body: fromBatchDbToApi(batch),
      };
    } catch (e) {
      return {
        status: 400 as const,
        body: {
          message: `No batch found with id ${id}`,
        },
      };
    }
  }

  @TsRest(contract.getUpsertBatchStatus)
  async getUpsertBatchStatus(
    @TsRestRequest()
    { params: { id } }: RequestShapes['getUpsertBatchStatus'],
    @Req() { supplier }: Request & { supplier: SupplierType },
  ) {
    try {
      const batch = await this.batchService.getBatch(id, supplier.id);

      return {
        status: 200 as const,
        body: {
          status: batch.status,
        },
      };
    } catch (e) {
      return {
        status: 400 as const,
        body: {
          message: `No batch found with id ${id}`,
        },
      };
    }
  }

  @TsRest(contract.putUpsertBatch)
  async putUpsertBatch(
    @TsRestRequest()
    { body }: RequestShapes['putUpsertBatch'],
    @Req() { supplier }: Request & { supplier: SupplierType },
  ) {
    const preprocessResult = await this.productBatchProcessor.preprocess(supplier, body);

    const { valid, async, batchId } = preprocessResult;
    let batchResult: BatchResult = preprocessResult.batchResult;

    if (!valid) {
      return {
        status: 422 as const,
        body: batchResult,
      };
    }

    if (async) {
      return {
        status: 202 as const,
        body: batchResult,
      };
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

      return {
        status: 422 as const,
        body: batchResult,
      };
    }

    if (batchResult.status === 'ERROR') {
      return {
        status: 422 as const,
        body: batchResult,
      };
    }

    return {
      status: 201 as const,
      body: batchResult,
    };
  }
}
