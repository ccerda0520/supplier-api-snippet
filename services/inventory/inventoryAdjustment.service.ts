import { HttpStatus, Injectable } from '@nestjs/common';
import { AdjustmentItem, AdjustmentItemsSchema } from 'commons-ephesus/schemas/supplier-api/inventory.schema';
import { SupplierType } from '../supplier.service';
import { PrismaService } from '../prisma.service';
import { Prisma } from 'commons-ephesus/generated/client';
import { IsAmongPlatforms } from 'commons-ephesus/functions/predicates/config.predicates';
import { MarketplacePlatform } from 'commons-ephesus/types/enums';
import { ApiBatchError, ApiBatchIssue, ApiError } from '../../functions/helpers/error.helpers';
import { omitUndefined } from 'commons-ephesus/functions/helpers/general.helpers';
import { keyExistsAndNotNull } from '../../functions/predicates/general.predicates';
import { isValidUuid } from 'commons-ephesus/functions/helpers/zod.helpers';
import { getActiveBillingSetting } from 'commons-ephesus/functions/helpers/billingSettings.helpers';
import pick from 'lodash/fp/pick';

@Injectable()
export class InventoryAdjustmentService {
  constructor(private prisma: PrismaService) {}

  async processAdjustments(adjustmentItems: AdjustmentItem[], supplier: SupplierType, manuallyValidate = false) {
    const suppliedProductVariantUpdates: Prisma.SuppliedProductVariantUpdateArgs[] = [];
    const productVariantsToUpdate: Prisma.ProductVariantUpdateArgs[] = [];
    const validationErrors: ApiBatchIssue[] = [];

    // You should manually validate this data if you call this method outside a controller that does the validation for you
    if (manuallyValidate) {
      AdjustmentItemsSchema.parse(adjustmentItems);
    }

    for (const [index, adjustmentItem] of adjustmentItems.entries()) {
      let matchedSuppliedProductVariant;
      try {
        matchedSuppliedProductVariant = await this.getMatchedSuppliedProductVariant(adjustmentItem, supplier);
      } catch (e) {
        validationErrors.push({ path: index, message: e.message });
        continue;
      }

      const variantUpdateData = {
        inventory_quantity: adjustmentItem.quantity,
        price: keyExistsAndNotNull(adjustmentItem.price, 'amount') ? adjustmentItem.price.amount : undefined,
        compare_at_price: keyExistsAndNotNull(adjustmentItem.compareToPrice, 'amount')
          ? adjustmentItem.compareToPrice.amount
          : undefined,
        wholesalePrice: keyExistsAndNotNull(adjustmentItem.wholesalePrice, 'amount')
          ? adjustmentItem.wholesalePrice.amount
          : undefined,
        inventory_policy: adjustmentItem.hasOwnProperty('unlimited')
          ? adjustmentItem.unlimited
            ? 'continue'
            : 'deny'
          : undefined,
      };
      suppliedProductVariantUpdates.push({
        data: omitUndefined(variantUpdateData),
        where: {
          id: matchedSuppliedProductVariant.id,
        },
      });

      try {
        const productVariantUpdate = await this.getProductVariantUpdate(matchedSuppliedProductVariant, adjustmentItem);
        if (productVariantUpdate) {
          // Only supporting merchant_api use case right now for updating the entire dataset
          if (IsAmongPlatforms(MarketplacePlatform.MERCHANT_API)) {
            productVariantsToUpdate.push(productVariantUpdate);
          } else if (
            IsAmongPlatforms(
              MarketplacePlatform.SHOPIFY,
              MarketplacePlatform.WOOCOMMERCE,
              MarketplacePlatform.NIC_AND_ZOE,
            )
          ) {
            if (productVariantUpdate.data.hasOwnProperty('wholesalePrice')) {
              const wholesaleRelatedFields = ['wholesalePrice', 'state', 'disabledAt', 'disabledCode', 'disabledEvent'];
              productVariantsToUpdate.push({
                ...productVariantUpdate,
                data: pick(wholesaleRelatedFields, productVariantUpdate.data),
              });
            }
          }
        }
      } catch (e) {
        validationErrors.push({ path: index, message: e.message });
        continue;
      }
    }

    if (validationErrors.length) {
      throw new ApiBatchError({
        issues: validationErrors,
        status: HttpStatus.UNPROCESSABLE_ENTITY,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      for (const suppliedProductVariantUpdate of suppliedProductVariantUpdates) {
        await tx.suppliedProductVariant.update(suppliedProductVariantUpdate);
      }

      for (const productVariantUpdate of productVariantsToUpdate) {
        await tx.productVariant.update(productVariantUpdate);
      }
    });
  }

  async getMatchedSuppliedProductVariant(
    adjustmentItem: AdjustmentItem,
    supplier: SupplierType,
  ): Promise<
    Prisma.SuppliedProductVariantGetPayload<{
      include: {
        SuppliedProduct: true;
      };
    }>
  > {
    const where: Prisma.SuppliedProductVariantWhereInput = {};
    let queryObject: { key: 'variantKey' | 'sku'; value: string };

    if (adjustmentItem.variantKey) {
      queryObject = {
        key: 'variantKey',
        value: adjustmentItem.variantKey,
      };

      where.OR = [{ variantId: adjustmentItem.variantKey }];

      if (isValidUuid(adjustmentItem.variantKey)) {
        where.OR.push({ id: adjustmentItem.variantKey });
      }
    }

    if (adjustmentItem.sku) {
      queryObject = {
        key: 'sku',
        value: adjustmentItem.sku,
      };

      where.OR = [{ sku: adjustmentItem.sku }, { generatedSku: adjustmentItem.sku }];
    }

    if (!Object.keys(where).length) {
      throw new ApiError({
        status: HttpStatus.BAD_REQUEST,
        message: 'Must pass a valid value for either variantKey or sku',
      });
    }

    if (
      adjustmentItem.currency &&
      supplier.config?.currency &&
      adjustmentItem.currency?.toLowerCase() !== supplier.config?.currency?.toLowerCase()
    ) {
      throw new ApiError({
        status: HttpStatus.BAD_REQUEST,
        message: 'Currency value does not match value inside of supplier configuration',
      });
    }

    const suppliedProductVariants = await this.prisma.suppliedProductVariant.findMany({
      where,
      include: {
        SuppliedProduct: true,
      },
    });

    if (!suppliedProductVariants.length) {
      throw new ApiError({
        status: HttpStatus.BAD_REQUEST,
        message: `No variant found with ${queryObject.key} value of ${queryObject.value}`,
      });
    }

    const matchedSuppliedProductVariants = suppliedProductVariants.filter(
      (spv) => spv.SuppliedProduct.vendorId === supplier.id,
    );

    if (!matchedSuppliedProductVariants.length) {
      throw new ApiError({
        message: `No variant matched with ${queryObject.key} value of ${queryObject.value} and supplier ${supplier.id}`,
        status: HttpStatus.BAD_REQUEST,
      });
    }

    if (matchedSuppliedProductVariants.length > 1) {
      throw new ApiError({
        message: `Multiple variants matched with ${queryObject.key} value of ${queryObject.value} and supplier ${supplier.id}`,
        status: HttpStatus.BAD_REQUEST,
      });
    }

    return matchedSuppliedProductVariants[0];
  }

  private async getProductVariantUpdate(
    suppliedProductVariant: Prisma.SuppliedProductVariantGetPayload<{
      include: {
        SuppliedProduct: true;
      };
    }>,
    adjustmentItem: AdjustmentItem,
  ): Promise<Prisma.ProductVariantUpdateArgs | null> {
    const matchedProductVariants = await this.prisma.productVariant.findMany({
      where: {
        vendorVariantId: suppliedProductVariant.variantId,
      },
      include: {
        Product: {
          include: {
            Brand: {
              include: {
                BillingSettings: true,
              },
            },
          },
        },
      },
    });

    if (!matchedProductVariants?.length) {
      return;
    }

    const matchedProductVariant = matchedProductVariants.find(
      (pv) => pv.Product.vendorId === suppliedProductVariant.SuppliedProduct.vendorId,
    );

    if (!matchedProductVariant) {
      return;
    }

    const variantUpdateData: Prisma.ProductVariantUpdateInput = {
      qty: adjustmentItem.quantity,
      price: keyExistsAndNotNull(adjustmentItem.price, 'amount') ? adjustmentItem.price.amount : undefined,
      compareAtPrice: keyExistsAndNotNull(adjustmentItem.compareToPrice, 'amount')
        ? adjustmentItem.compareToPrice.amount
        : undefined,
      wholesalePrice: keyExistsAndNotNull(adjustmentItem.wholesalePrice, 'amount')
        ? adjustmentItem.wholesalePrice.amount
        : undefined,
      trackInventory: adjustmentItem.hasOwnProperty('unlimited') ? !adjustmentItem.unlimited : undefined,
    };

    // we use qty of 1000 to signify unlimited qty in our system
    if (adjustmentItem.hasOwnProperty('unlimited') && adjustmentItem.unlimited) {
      variantUpdateData.qty = 1000;
    }

    const activeBillingSetting = getActiveBillingSetting(matchedProductVariant.Product?.Brand?.BillingSettings);
    const isWholesaleBilling = activeBillingSetting?.billingType === 'WHOLESALE';

    if (adjustmentItem.wholesalePrice?.amount) {
      if (!isWholesaleBilling) {
        throw new Error(`Cannot update wholesalePrice, brand is commission billing`);
      }

      if (matchedProductVariant.disabledCode === 'missing_wholesale_price') {
        const matchedSuppliedProductVariant = await this.prisma.suppliedProductVariant.findFirst({
          where: {
            variantId: matchedProductVariant.vendorVariantId,
            productId: matchedProductVariant.Product.vendorProductId,
            state: 'ENABLED',
            SuppliedProduct: {
              state: 'ENABLED',
              vendorId: matchedProductVariant.Product.vendorId,
            },
          },
          include: {
            SuppliedProduct: true,
          },
        });

        if (matchedSuppliedProductVariant) {
          variantUpdateData.state = 'ENABLED';
          variantUpdateData.disabledCode = null;
          variantUpdateData.disabledAt = null;
          variantUpdateData.disabledEvent = null;
        } else {
          variantUpdateData.disabledCode = null;
          variantUpdateData.disabledEvent = 'Supplier product variant is disabled';
        }
      }
    }

    return {
      data: omitUndefined(variantUpdateData),
      where: {
        id: matchedProductVariant.id,
      },
    };
  }
}
