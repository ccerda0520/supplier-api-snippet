import { Controller, HttpStatus, UseGuards } from '@nestjs/common';
import {
  nestControllerContract,
  NestControllerInterface,
  NestRequestShapes,
  TsRest,
  TsRestRequest,
} from '@ts-rest/nest';
import { adminContract } from 'commons-ephesus/contracts/supplier-api/admin.contract';
import { SupplierService } from '../services/supplier.service';
import { TasksService } from '../services/tasks.service';
import { AdminAuthGuard } from '../guards/adminAuth.guard';
import { ProductBatchProcessor } from '../processors/productBatch.processor';
import { BatchService } from '../services/batch.service';
import { fromBatchDbToApi } from '../functions/mappers/batch.mappers';
import { Prisma } from 'commons-ephesus/generated/client';
import { ApiError } from '../functions/helpers/error.helpers';

const contract = nestControllerContract(adminContract);

type RequestShapes = NestRequestShapes<typeof contract>;

@Controller('admin')
@UseGuards(AdminAuthGuard)
export class AdminController implements NestControllerInterface<typeof contract> {
  constructor(
    private supplierService: SupplierService,
    private tasksService: TasksService,
    private productBatchProcessor: ProductBatchProcessor,
    private batchService: BatchService,
  ) {}

  @TsRest(contract.postProductCacheSync)
  async postProductCacheSync(@TsRestRequest() { params: { supplierId } }: RequestShapes['postProductCacheSync']) {
    const supplier = await this.supplierService.getSupplierById(supplierId);

    if (!supplier) {
      throw new ApiError({
        status: HttpStatus.BAD_REQUEST,
        message: `Supplier with id ${supplierId} not found.`,
      });
    }

    try {
      await this.tasksService.supplierProductCacheSync(supplier);
    } catch (e) {
      console.log(e);
    }

    return {
      status: 202 as const,
      body: {
        success: true,
      },
    };
  }

  @TsRest(contract.postProductBatchProcess)
  async postProductBatchProcess(
    @TsRestRequest()
    { params: { id } }: RequestShapes['postProductBatchProcess'],
  ) {
    const batch = await this.batchService.getBatchById(id);

    if (!batch) {
      throw new ApiError({
        status: HttpStatus.BAD_REQUEST,
        message: `No batch with id: ${id}`,
      });
    }

    if (batch.status !== 'PENDING') {
      throw new ApiError({
        status: HttpStatus.BAD_REQUEST,
        message: `Batch ${id} is not in a pending state, cannot be processed.`,
      });
    }

    if (batch.type !== 'SUPPLIED_PRODUCT') {
      throw new ApiError({
        status: HttpStatus.BAD_REQUEST,
        message: `Batch ${id} is not of type SUPPLIED_PRODUCT, cannot be processed.`,
      });
    }

    try {
      await this.productBatchProcessor.process(batch.id, {
        ...batch.Vendor,
        config: JSON.parse(batch.Vendor.config),
        auth: JSON.parse(batch.Vendor.auth),
      });
    } catch (e) {
      await this.batchService.updateBatch(batch.id, {
        status: 'ERROR',
        result: {
          ...fromBatchDbToApi(batch as unknown as Prisma.BatchCreateInput),
          customData: {
            message: `Internal Error: ${e.message}`,
          },
        },
      });
    }

    return {
      status: 202 as const,
      body: {
        success: true,
      },
    };
  }
}
