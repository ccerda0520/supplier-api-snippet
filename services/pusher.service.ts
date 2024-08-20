import { Injectable } from '@nestjs/common';
import config from '../../config';
import { IsAmongPlatforms } from 'commons-ephesus/functions/predicates/config.predicates';
import { MarketplacePlatform } from 'commons-ephesus/types/enums';
import { v1 } from 'uuid';
import { queueManager } from 'commons-ephesus';
import { ProductImageSyncItem, VariantStatusUpdateItem } from './pusher.service.types';

@Injectable()
export class PusherService {
  private queueParams = {
    accessKeyId: config.SQS_ACCESS_KEY_ID,
    secretAccessKey: config.SQS_SECRET_ACCESS_KEY_ID,
    region: config.SQS_REGION,
    WaitTimeSeconds: Number(config.SQS_WAIT_TIME_SECONDS),
    QueueUrl: '',
    MessageBody: '',
  };

  private async sendMessage(
    data: Record<string, any>,
    type: string,
    queueUrl: string,
    queueMsgGroupId: string,
    supplierId: string,
  ) {
    if (IsAmongPlatforms(MarketplacePlatform.MERCHANT_API)) {
      return;
    }

    const message: Record<string, any> = {
      data,
      type,
      vendorId: supplierId,
      queueMessageId: v1(),
      marketplacePlatform: config.MARKET_PLACE_PLATFORM,
      clientId: config.CLIENT_ID,
    };

    try {
      await queueManager.sendMessage({
        ...this.queueParams,
        MessageBody: JSON.stringify(message),
        QueueUrl: queueUrl,
        MessageGroupId: queueMsgGroupId,
      });
    } catch (e) {}

    return true;
  }

  // technically this handles changes to: qty, price, compareAtPrice, sku
  async sendVariantInventoryPricesUpdate(items: IVariantInventoryInfo[], supplierId: string) {
    await this.sendMessage(
      { products: items },
      'UPDATE_INVENTORY_PRICES',
      config.SQS_INVENTORY_PUSHER_URL || config.SQS_PUSHER_URL,
      `UPDATE_INVENTORY_PRICES_${supplierId}`,
      supplierId,
    );
  }

  async sendVariantStatusUpdate(items: VariantStatusUpdateItem[], supplierId: string) {
    await this.sendMessage(
      { disabledProducts: items },
      'ENABLED_DISABLED_PRODUCTS',
      config.SQS_PUSHER_URL,
      `DISABLED_PRODUCTS_${supplierId}`,
      supplierId,
    );
  }

  async sendProductImages(items: ProductImageSyncItem[], supplierId: string) {
    await this.sendMessage(
      { products: items },
      'SYNC_PRODUCT_IMAGES',
      config.SQS_PUSHER_URL,
      `SYNC_PRODUCT_IMAGES_${supplierId}`,
      supplierId,
    );
  }
}
