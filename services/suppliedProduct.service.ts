import { PrismaService } from './prisma.service';
import { Injectable } from '@nestjs/common';
import { SuppliedProductInput } from '../functions/mappers/suppliedProduct.mappers';
import { SupplierType } from './supplier.service';
import omit from 'lodash/fp/omit';
import { v4 } from 'uuid';
import config from '../../config';

@Injectable()
export class SuppliedProductService {
  constructor(private prisma: PrismaService) {}

  async upsertSuppliedProduct(product: SuppliedProductInput, supplier: SupplierType) {
    const productUpsertObject = omit('variants', product);
    const suppliedProductUpsertResponse = await this.prisma.suppliedProduct.upsert({
      create: {
        ...productUpsertObject,
        vendorId: supplier.id,
      },
      update: productUpsertObject,
      where: {
        productId_vendorId: {
          productId: product.productId,
          vendorId: supplier.id,
        },
      },
    });

    const upsertedSuppliedProductVariants = [];
    for (const variant of product.variants) {
      const suppliedProductVariantUpsertResponse = await this.prisma.suppliedProductVariant.upsert({
        create: {
          ...variant,
          suppliedProductId: suppliedProductUpsertResponse.id,
        },
        update: variant,
        where: {
          variantId_productId_suppliedProductId: {
            variantId: variant.variantId,
            productId: product.productId,
            suppliedProductId: suppliedProductUpsertResponse.id,
          },
        },
      });

      upsertedSuppliedProductVariants.push(suppliedProductVariantUpsertResponse);
    }

    await this.createGeneratedSkus({
      ...suppliedProductUpsertResponse,
      variants: upsertedSuppliedProductVariants,
    });

    return suppliedProductUpsertResponse.id;
  }

  async disableMissingSuppliedProductsAndVariants(supplier: SupplierType, suppliedProductIds: string[]) {
    const suppliedProductsToDisable = await this.prisma.suppliedProduct.findMany({
      where: {
        vendorId: supplier.id,
        state: 'ENABLED',
        id: {
          notIn: suppliedProductIds,
        },
      },
    });

    const suppliedProductIdsToDisable = suppliedProductsToDisable.map((sp) => sp.id);

    await this.prisma.suppliedProduct.updateMany({
      data: {
        state: 'DISABLED',
      },
      where: {
        id: { in: suppliedProductIdsToDisable },
      },
    });

    await this.prisma.suppliedProductVariant.updateMany({
      data: {
        state: 'DISABLED',
        inventory_quantity: 0,
        inventory_policy: 'deny',
      },
      where: {
        suppliedProductId: {
          in: suppliedProductIdsToDisable,
        },
      },
    });

    return suppliedProductIdsToDisable;
  }

  async getSuppliedProductsBySupplierId(supplierId: string) {
    return this.prisma.suppliedProduct.findMany({
      where: {
        vendorId: supplierId,
      },
      include: {
        SuppliedProductVariants: true,
      },
    });
  }

  async createGeneratedSkus(suppliedProduct: SuppliedProductInput) {
    const updatedVariants = [];

    for (const variant of suppliedProduct.variants) {
      if (variant.generatedSku) {
        continue;
      }

      const generatedSku = await this.createUniqueSku(variant.id);
      updatedVariants.push({
        generatedSku,
        id: variant.id,
      });
    }

    for (const updatedVariant of updatedVariants) {
      await this.prisma.suppliedProductVariant.update({
        data: {
          generatedSku: updatedVariant.generatedSku,
        },
        where: {
          id: updatedVariant.id,
        },
      });
    }
  }

  private async createUniqueSku(uuid: string) {
    let sku = this.getCombinedSkuValue(uuid);
    let skuIsUnique = await this.isSkuUnique(sku);

    while (!skuIsUnique) {
      sku = this.getCombinedSkuValue(v4());
      skuIsUnique = await this.isSkuUnique(sku);
    }

    return sku;
  }

  private getCombinedSkuValue(uuid: string) {
    const skuPrefix = config.GENERATED_SKU_PREFIX;
    return skuPrefix + uuid.slice(-8);
  }

  private async isSkuUnique(sku: string) {
    const matchedVariantBySku = await this.prisma.suppliedProductVariant.findFirst({
      where: {
        generatedSku: sku,
      },
    });

    return !matchedVariantBySku;
  }
}
