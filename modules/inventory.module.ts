import { Module, Global } from '@nestjs/common';
import { InventoryController } from '../controllers/inventory.controller';
import { InventoryAdjustmentService } from '../services/inventory/inventoryAdjustment.service';

@Global()
@Module({
  controllers: [InventoryController],
  providers: [InventoryAdjustmentService],
  exports: [InventoryAdjustmentService],
})
export class InventoryModule {}
