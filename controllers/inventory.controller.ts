import {
  nestControllerContract,
  NestControllerInterface,
  NestRequestShapes,
  TsRest,
  TsRestRequest,
} from '@ts-rest/nest';
import { Controller, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../guards/auth.guard';
import { Request } from 'express';
import { SupplierService, SupplierType } from '../services/supplier.service';
import { inventoryContract } from 'commons-ephesus/contracts/supplier-api/inventory.contract';
import { InventoryAdjustmentService } from '../services/inventory/inventoryAdjustment.service';

const contract = nestControllerContract(inventoryContract);

type RequestShapes = NestRequestShapes<typeof contract>;

@Controller('inventory')
@UseGuards(AuthGuard)
export class InventoryController implements NestControllerInterface<typeof contract> {
  constructor(
    private supplierService: SupplierService,
    private inventoryAdjustmentService: InventoryAdjustmentService,
  ) {}
  @TsRest(contract.postInventoryAdjustment)
  async postInventoryAdjustment(
    @TsRestRequest() { body }: RequestShapes['postInventoryAdjustment'],
    @Req() { supplier }: Request & { supplier: SupplierType },
  ) {
    const adjustmentItems = body;

    await this.inventoryAdjustmentService.processAdjustments(adjustmentItems, supplier);

    return {
      status: 204 as const,
      body: {},
    };
  }
}
