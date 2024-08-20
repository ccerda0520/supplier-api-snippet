import {
  nestControllerContract,
  NestControllerInterface,
  NestRequestShapes,
  TsRest,
  TsRestRequest,
} from '@ts-rest/nest';
import { Controller, HttpStatus, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../guards/auth.guard';
import { TasksService } from '../services/tasks.service';
import { supplierContract } from 'commons-ephesus/contracts/supplier-api/supplier.contract';
import { Request } from 'express';
import { SupplierJwt, SupplierService, SupplierType } from '../services/supplier.service';
import { ApiError } from '../functions/helpers/error.helpers';

const contract = nestControllerContract(supplierContract);

type RequestShapes = NestRequestShapes<typeof contract>;

@Controller('')
@UseGuards(AuthGuard)
export class SupplierController implements NestControllerInterface<typeof contract> {
  constructor(private supplierService: SupplierService, private tasksService: TasksService) {}

  @TsRest(contract.postProductCacheSync)
  async postProductCacheSync(
    @TsRestRequest() { body }: RequestShapes['postProductCacheSync'],
    @Req() { supplier }: Request & { supplier: SupplierType },
  ) {
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
}
