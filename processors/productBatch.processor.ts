import {
  BatchProduct,
  BatchProductError,
  BatchProductVariant,
  BatchProductVariantError,
  batchProductVariantSchema,
} from 'commons-ephesus/schemas/supplier-api/product.schema';
import { SafeParseError } from 'zod/lib/types';
import {
  fromBatchProductToSuppliedProductDbModel,
  fromBatchProductVariantToSuppliedProductVariantDbModel,
  SuppliedProductInput,
} from '../functions/mappers/suppliedProduct.mappers';
import flatten from 'lodash/fp/flatten';
import map from 'lodash/fp/map';
import cloneDeep from 'lodash/fp/cloneDeep';
import { SuppliedProductService } from '../services/suppliedProduct.service';
import { SupplierService, SupplierType } from '../services/supplier.service';
import { HttpStatus, Injectable } from '@nestjs/common';
import { isEqualOnSharedKeys } from '../functions/predicates/general.predicates';
import { BatchService } from '../services/batch.service';
import { BatchResult, BatchStatus, BatchUpsertBody } from 'commons-ephesus/schemas/batch.schema';
import { validateBatch } from '../functions/validators/productBatch.validators';
import { ApiError } from '../functions/helpers/error.helpers';
import { IsNotSameCurrency } from '../functions/helpers/batch.helpers';
import { SuppliedProductSyncService } from '../services/product/suppliedProductSync.service';

export type BatchProcessResult = {
  importedProducts: { productKey: string }[];
  errors: BatchProductError[];
  status: BatchStatus;
};

type BatchProductVariantWithProductKeyError = BatchProductVariantError & { productKey: string };
@Injectable()
export class ProductBatchProcessor {
  constructor(
    private suppliedProductService: SuppliedProductService,
    private batchService: BatchService,
    private supplierService: SupplierService,
    private suppliedProductSyncService: SuppliedProductSyncService,
  ) {}

  async preprocess(supplier: SupplierType, body: BatchUpsertBody) {
    const refProducts = body.products.map((product, index) => ({
      ...product,
      refId: index,
      variants: product?.variants?.map((variant, index) => ({
        ...variant,
        refId: index,
      })),
    }));

    const dbBatch = await this.batchService.createBatch({
      type: 'SUPPLIED_PRODUCT',
      status: 'PENDING',
      content: {
        batch: body.batch,
        products: refProducts,
      } as Record<string, any>,
      vendorId: supplier.id,
      name: body.batch.batchName,
      date: body.batch.batchDate,
    });

    const supplierImportSettings = supplier.config?.productsSyncSettings || {};

    const preProcessResult: { valid: boolean; async: boolean; batchId: string; batchResult: BatchResult } = {
      valid: true,
      async: false,
      batchId: '',
      batchResult: {
        id: '',
        batchName: body.batch.batchName,
        batchDate: body.batch.batchDate,
        batchRunDate: null,
        customData: {},
        status: 'PENDING',
        productsImportedCount: null,
        productsNotImportedCount: null,
        productsImported: [],
        productsNotImported: [],
      },
    };

    // basic validation of data
    // @ts-ignore migrate to strictNullChecks
    const batchValidationResult = validateBatch(refProducts);
    // @ts-ignore migrate to strictNullChecks
    preProcessResult.batchResult.productsNotImported.push(...batchValidationResult.errors);

    preProcessResult.batchResult.id = dbBatch.id;
    preProcessResult.batchId = dbBatch.id;

    // determine if amount of valid products is enough to continue processing the batch
    if (!batchValidationResult.isBatchValid) {
      preProcessResult.batchResult.status = 'ERROR';
      preProcessResult.batchResult.customData.message = 'Too many errors in batch, could not process';

      preProcessResult.valid = false;

      const runDate = new Date();
      await this.batchService.updateBatch(dbBatch.id, {
        status: preProcessResult.batchResult.status,
        result: {
          message: preProcessResult.batchResult as Record<string, any>,
        },
        runDate,
      });
      preProcessResult.batchResult.batchRunDate = runDate;

      return preProcessResult;
    }

    if (supplierImportSettings.asyncMode) {
      preProcessResult.async = true;
      return preProcessResult;
    }

    return preProcessResult;
  }

  async process(batchId: string, supplier: SupplierType, batchPartialResult?: BatchResult): Promise<BatchResult> {
    const dbBatch = await this.batchService.getBatch(batchId, supplier.id);
    if (!dbBatch) {
      throw new ApiError({
        status: HttpStatus.BAD_REQUEST,
        message: `No batch found with id: ${batchId}}`,
      });
    }

    const batchResult: BatchResult = batchPartialResult ?? {
      id: dbBatch.id,
      batchName: dbBatch.name,
      batchDate: dbBatch.date,
      batchRunDate: null,
      customData: {},
      status: dbBatch.status,
      productsImportedCount: null,
      productsNotImportedCount: null,
      productsImported: [],
      productsNotImported: [],
    };

    // Should only be processing a pending batch, otherwise its either been processed or is processing
    if (dbBatch.status !== 'PENDING') {
      return batchResult;
    }

    // @ts-ignore migrate to strictNullChecks
    const products: BatchProduct[] = validateBatch((dbBatch.content as BatchUpsertBody)?.products).validProducts;

    const runDate = new Date();
    await this.batchService.updateBatch(dbBatch.id, {
      status: 'PROCESSING',
      runDate,
    });
    batchResult.batchRunDate = runDate;

    const isLatestBatch = await this.batchService.isLatestBatch(dbBatch.date, supplier.id);

    if (!isLatestBatch) {
      const resultMessage = 'A completed batch exists that has more recent product information.';
      await this.batchService.updateBatch(dbBatch.id, {
        status: 'ERROR',
        result: {
          message: resultMessage,
        },
      });

      throw new ApiError({
        status: HttpStatus.BAD_REQUEST,
        message: resultMessage,
      });
    }
    const supplierImportSettings = supplier.config?.productsSyncSettings || {};

    const isImmutableVariantKeyScenario = supplierImportSettings.immutableVariantKey === true;

    // Not handling this one right now
    const isImmutableProductKeyScenario =
      supplierImportSettings.hasOwnProperty('immutableVariantKey') &&
      supplierImportSettings.immutableVariantKey !== true;

    // There are different import scenarios, each processes imports differently
    if (isImmutableVariantKeyScenario) {
      const result = await this.processImmutableVariantKeysUpsert(products, supplier, runDate);
      // @ts-ignore migrate to strictNullChecks
      batchResult.productsImported.push(...result.importedProducts);
      batchResult.productsImportedCount = batchResult.productsImported.length;
      // @ts-ignore migrate to strictNullChecks
      batchResult.productsNotImported.push(...result.errors);
      batchResult.productsNotImportedCount = batchResult.productsNotImported.length;
      batchResult.status = result.status;
    } else if (isImmutableProductKeyScenario) {
      await this.processImmutableProductKeysUpsert(products, supplier);
    } else {
      const resultMessage = 'No product sync settings defined in supplier config';
      await this.batchService.updateBatch(dbBatch.id, {
        status: 'ERROR',
        result: {
          message: resultMessage,
        },
      });

      throw new ApiError({
        status: HttpStatus.BAD_REQUEST,
        message: resultMessage,
      });
    }

    if (batchResult.status === 'ERROR') {
      batchResult.customData.message = 'Failed because of too many errors found in batch, changes were not persisted.';
    }

    await this.batchService.updateBatch(dbBatch.id, {
      status: batchResult.status,
      result: batchResult as Record<string, any>,
    });

    if (batchResult.status === 'SUCCESS') {
      await this.supplierService.updateSupplier(supplier.id, {
        config: JSON.stringify({
          ...supplier.config,
          latestProductsSyncTimeStamp: dbBatch.date.toISOString(),
        }),
      });
    }

    return batchResult;
  }

  private validateVariantAdditional(
    variant: BatchProductVariant,
    product: BatchProduct,
    supplier: SupplierType,
  ): { isValid: boolean; error?: string; updatedVariant?: BatchProductVariant } {
    const updatedVariant = cloneDeep(variant);
    const supplierImportSettings = supplier.config?.productsSyncSettings || {};
    const validationErrors: string[] = [];

    // For these validations, we also include deleting the keys if the supplier is set not to process the key
    if (
      supplierImportSettings.hasPricing &&
      (!updatedVariant.hasOwnProperty('price') || !updatedVariant.price?.hasOwnProperty('amount'))
    ) {
      validationErrors.push('hasPricing flag is set for this supplier but variant is missing a price value');
    } else if (!supplierImportSettings.hasPricing) {
      delete updatedVariant.price;
    }

    if (supplierImportSettings.hasInventory && !updatedVariant.hasOwnProperty('stock')) {
      validationErrors.push('hasInventory flag is set for this supplier but variant is missing a stock value');
    } else if (!supplierImportSettings.hasInventory) {
      delete updatedVariant.stock;
    }

    if (
      supplierImportSettings.hasWholesalePricing &&
      (!updatedVariant.hasOwnProperty('wholesalePrice') || !updatedVariant.wholesalePrice?.hasOwnProperty('amount'))
    ) {
      validationErrors.push(
        'hasWholesalePricing flag is set for this supplier but variant is missing a wholesalePrice value',
      );
    } else if (!supplierImportSettings.hasWholesalePricing) {
      delete updatedVariant.wholesalePrice;
    }

    if (supplier.config?.currency) {
      if (IsNotSameCurrency(updatedVariant, supplier.config.currency)) {
        validationErrors.push('currency supplier configuration does not match the currency sent');
      }
    }

    // Product specific validations

    if (!product) {
      validationErrors.push('batch product does not exist for this batch product variant');
    }

    // Product options empty/null, variant options specified
    if (!product.options?.length && Object.keys(variant?.options)?.length) {
      validationErrors.push('variant includes options but product has no options');
    }

    // Product options missing, variant options specified
    const invalidOptions = variant.options
      ? Object.keys(variant.options).filter((optionKey) => !product.options?.includes(optionKey))
      : [];
    if (invalidOptions.length) {
      validationErrors.push(`variant includes options that are not found in product: ${invalidOptions.join(',')}`);
    }

    // Product options specified, variant options empty/null
    const missingOptions = product.options?.filter((option) => !variant.options?.hasOwnProperty(option)) || [];
    if (missingOptions.length) {
      validationErrors.push(`variant is missing the following options found in product: ${missingOptions.join(',')}`);
    }

    if (validationErrors.length) {
      return {
        isValid: false,
        error: validationErrors.join('; '),
      };
    }

    return { updatedVariant, isValid: true };
  }

  private async processImmutableVariantKeysUpsert(
    products: BatchProduct[],
    supplier: SupplierType,
    batchTimestamp: Date,
  ): Promise<BatchProcessResult> {
    const processResult: BatchProcessResult = {
      importedProducts: [],
      errors: [],
      status: 'PROCESSING',
    };
    const variantErrors: BatchProductVariantWithProductKeyError[] = [];
    const suppliedProductsToUpsert: Record<string, SuppliedProductInput> = {};

    // variants are the source of truth here, flatten all variants and go from there ;(
    const flattenedVariants = flatten(
      map((product) => product.variants.map((variant) => ({ ...variant, productKey: product.productKey })), products),
    );

    // objects holding products by productKey for quicker lookup
    const productKeyPairs: Record<string, BatchProduct> = products.reduce<Record<string, BatchProduct>>(
      (acc, product) => ({
        ...acc,
        [product.productKey]: product,
      }),
      {},
    );
    const mappedProductKeyPairs: Record<string, SuppliedProductInput> = products.reduce<
      Record<string, SuppliedProductInput>
    >(
      (acc, product) => ({
        ...acc,
        [product.productKey]: fromBatchProductToSuppliedProductDbModel(product),
      }),
      {},
    );

    const existingSuppliedProducts = await this.suppliedProductService.getSuppliedProductsBySupplierId(supplier.id);
    const existingFlattenedSuppliedProductVariants = flatten(map('SuppliedProductVariants', existingSuppliedProducts));

    for (const variant of flattenedVariants) {
      const variantSchemaValidationResult = batchProductVariantSchema.safeParse(variant);

      if (!variantSchemaValidationResult.success) {
        const errorMessage = Object.entries(
          (variantSchemaValidationResult as SafeParseError<typeof variant>).error.flatten()?.fieldErrors,
        )
          .map(([key, value]) => `${key}: ${value}`)
          .join(';');
        variantErrors.push({
          variantKey: variant.variantKey,
          refId: variant.refId,
          productKey: variant.productKey,
          reason: errorMessage,
        });
        continue;
      }

      let variantValidatedData = variantSchemaValidationResult.data;
      const variantSupplierAdditionalValidationResult = this.validateVariantAdditional(
        variantValidatedData,
        productKeyPairs[variant.productKey],
        supplier,
      );

      if (!variantSupplierAdditionalValidationResult.isValid) {
        variantErrors.push({
          variantKey: variant.variantKey,
          refId: variant.refId,
          productKey: variant.productKey,
          reason: variantSupplierAdditionalValidationResult.error,
        });
        continue;
      }

      variantValidatedData = variantSupplierAdditionalValidationResult.updatedVariant;

      const mappedVariantValidatedData = fromBatchProductVariantToSuppliedProductVariantDbModel(
        productKeyPairs[variant.productKey],
        variantValidatedData,
      );

      /**
       * @note in the original spec we wouldnt use the `productId` comparison because the original idea was to just update
       * the product id the variant is pointed to, but with how our system works I'm afraid of the data integrity with
       * this approach, so the revised approach was to disable the original variant and create a new variant
       */
      const matchedExistingSuppliedProductVariants = existingFlattenedSuppliedProductVariants.filter(
        (variant) =>
          variant.variantId === mappedVariantValidatedData.variantId &&
          variant.productId === mappedVariantValidatedData.productId,
      );

      if (matchedExistingSuppliedProductVariants.length) {
        // duplicate keys, no bueno
        if (matchedExistingSuppliedProductVariants.length > 1) {
          variantErrors.push({
            variantKey: variant.variantKey,
            refId: variant.refId,
            productKey: variant.productKey,
            reason: 'found duplicate entries in suppliedProductVariant with this variant key',
          });
          continue;
        }

        const matchedExistingSuppliedProductVariant = matchedExistingSuppliedProductVariants[0];
        const isProductKeySame =
          matchedExistingSuppliedProductVariant.productId === mappedVariantValidatedData.productId;
        if (isProductKeySame) {
          // any change?
          const hasVariantChanged = !isEqualOnSharedKeys(
            matchedExistingSuppliedProductVariant,
            mappedVariantValidatedData,
          );

          // variant has no new changes, just update the checkedOn column
          if (!hasVariantChanged) {
            suppliedProductsToUpsert[variant.productKey] = {
              ...mappedProductKeyPairs[variant.productKey],
              variants: [...(suppliedProductsToUpsert[variant.productKey]?.variants || []), mappedVariantValidatedData],
            };

            continue;
          }

          const matchedExistingSuppliedProduct = existingSuppliedProducts.find(
            (suppliedProduct) => suppliedProduct.productId === mappedVariantValidatedData.productId,
          );

          if (!matchedExistingSuppliedProduct) {
            // @todo add error here should not happen
            continue;
          }

          const matchedVariantHasSameOptions =
            mappedVariantValidatedData.option1 === matchedExistingSuppliedProductVariant.option1 &&
            mappedVariantValidatedData.option2 === matchedExistingSuppliedProductVariant.option2 &&
            mappedVariantValidatedData.option3 === matchedExistingSuppliedProductVariant.option3;

          // Same options is considered Immaterial Update to variant, add it to updates
          if (matchedVariantHasSameOptions) {
            suppliedProductsToUpsert[variant.productKey] = {
              ...mappedProductKeyPairs[variant.productKey],
              variants: [...(suppliedProductsToUpsert[variant.productKey]?.variants || []), mappedVariantValidatedData],
            };
            continue;
          }

          // products exists, does it have a variant with same options as this one?
          const variantWithSameOptions = matchedExistingSuppliedProduct.SuppliedProductVariants?.find((variant) => {
            if (variant.option1 && variant.option1 !== mappedVariantValidatedData.option1) {
              return false;
            }

            if (variant.option2 && variant.option2 !== mappedVariantValidatedData.option2) {
              return false;
            }

            if (variant.option3 && variant.option3 !== mappedVariantValidatedData.option3) {
              return false;
            }

            return true;
          });

          // variant found within matched product but has different variant key, this is considered material change
          if (variantWithSameOptions) {
            // @todo deactivate variantWithSameOptions
            // @todo deactivate matchedExistingSuppliedProductVariant
            suppliedProductsToUpsert[variant.productKey] = {
              ...mappedProductKeyPairs[variant.productKey],
              variants: [...(suppliedProductsToUpsert[variant.productKey]?.variants || []), mappedVariantValidatedData],
            };
            continue;
          }

          // product key same, variant key is found but with material change
          // @todo deactivate matchedExistingSuppliedProductVariant imported equivalent
          suppliedProductsToUpsert[variant.productKey] = {
            ...mappedProductKeyPairs[variant.productKey],
            variants: [...(suppliedProductsToUpsert[variant.productKey]?.variants || []), mappedVariantValidatedData],
          };
        } else {
          // We need to determine if the new product key has an entry in the product batch
          const productInBatch = mappedProductKeyPairs[variant.productKey];

          if (!productInBatch) {
            // @todo add error here, there is no parent to associate to this variant
            continue;
          }

          const matchedVariantHasSameOptions =
            mappedVariantValidatedData.option1 === matchedExistingSuppliedProductVariant.option1 &&
            mappedVariantValidatedData.option2 === matchedExistingSuppliedProductVariant.option2 &&
            mappedVariantValidatedData.option3 === matchedExistingSuppliedProductVariant.option3;

          // Same options is considered Immaterial Update to variant, add it to updates
          if (matchedVariantHasSameOptions) {
            // @todo review with greg this scenario, seems dangerous to me if we just "point variant to new product"
            suppliedProductsToUpsert[variant.productKey] = {
              ...mappedProductKeyPairs[variant.productKey],
              variants: [...(suppliedProductsToUpsert[variant.productKey]?.variants || []), mappedVariantValidatedData],
            };
            continue;
          }

          // products exists, does it have a variant with same options as this one?
          const hasVariantWithSameOptions =
            mappedVariantValidatedData.option1 === productInBatch.option1 &&
            mappedVariantValidatedData.option2 === productInBatch.option2 &&
            mappedVariantValidatedData.option3 === productInBatch.option3;

          if (hasVariantWithSameOptions) {
            suppliedProductsToUpsert[variant.productKey] = {
              ...mappedProductKeyPairs[variant.productKey],
              variants: [...(suppliedProductsToUpsert[variant.productKey]?.variants || []), mappedVariantValidatedData],
            };
            // @todo deactivate variantWithSameOptions , we may not have to handle this, if I query upsert include options in where statement, I will be able to create a new variant, and later disable non updated varaints
            // @todo deactivate matchedExistingSuppliedProductVariant
          } else {
            suppliedProductsToUpsert[variant.productKey] = {
              ...mappedProductKeyPairs[variant.productKey],
              variants: [...(suppliedProductsToUpsert[variant.productKey]?.variants || []), mappedVariantValidatedData],
            };
            // @todo deactivate matchedExistingSuppliedProductVariant
          }
        }
      } else {
        const matchedExistingSuppliedProduct = existingSuppliedProducts.find(
          (suppliedProduct) => suppliedProduct.productId === variant.productKey,
        );

        // New Variant and new Product
        if (!matchedExistingSuppliedProduct) {
          suppliedProductsToUpsert[variant.productKey] = {
            ...mappedProductKeyPairs[variant.productKey],
            variants: [...(suppliedProductsToUpsert[variant.productKey]?.variants || []), mappedVariantValidatedData],
          };
          continue;
        }

        // products exists, does it have a variant with same options as this one?
        const hasVariantWithSameOptions = matchedExistingSuppliedProduct.SuppliedProductVariants?.some((variant) => {
          if (variant.option1 && variant.option1 !== mappedVariantValidatedData.option1) {
            return false;
          }

          if (variant.option2 && variant.option2 !== mappedVariantValidatedData.option2) {
            return false;
          }

          if (variant.option3 && variant.option3 !== mappedVariantValidatedData.option3) {
            return false;
          }

          return true;
        });

        // Immaterial Update to variant, add it to updates
        if (hasVariantWithSameOptions) {
          suppliedProductsToUpsert[variant.productKey] = {
            ...mappedProductKeyPairs[variant.productKey],
            variants: [...(suppliedProductsToUpsert[variant.productKey]?.variants || []), mappedVariantValidatedData],
          };
        } else {
          // @todo handle this use case, should not be reachable but still
        }
      }
    }

    // Combine variant errors into product key format expected by process
    const errorProductKeyPairs: Record<string, BatchProductError> = variantErrors.reduce(
      (acc, error) => ({
        ...acc,
        [error.productKey]: {
          productKey: error.productKey,
          refId: productKeyPairs[error.productKey]?.refId,
          reason: 'errors occurred with variants',
          variants: [
            ...(acc[error.productKey]?.variants || []),
            {
              variantKey: error.variantKey,
              refId: error.refId,
              reason: error.reason,
            },
          ],
        },
      }),
      {},
    );

    // Remove a product from the list of items to upsert, if it has at least 1 variant with an error
    for (const productKey of Object.keys(suppliedProductsToUpsert)) {
      if (errorProductKeyPairs.hasOwnProperty(productKey)) {
        delete suppliedProductsToUpsert[productKey];
      }
    }

    processResult.errors.push(...Object.values(errorProductKeyPairs));

    for (const suppliedProduct of Object.values(suppliedProductsToUpsert)) {
      suppliedProduct.checkedOn = batchTimestamp;
      for (const variant of suppliedProduct?.variants) {
        variant.checkedOn = batchTimestamp;
      }
    }

    const validProductsRatio = Object.values(suppliedProductsToUpsert).length / products.length;
    const validProductsPercentage = validProductsRatio * 100;
    if (validProductsPercentage < 60) {
      processResult.status = 'ERROR';
      return processResult;
    }

    await this.upsertSuppliedProducts(Object.values(suppliedProductsToUpsert), supplier, batchTimestamp);

    processResult.importedProducts.push(
      ...Object.values(suppliedProductsToUpsert).map((product) => ({
        productKey: product.productId,
        variants: product.variants?.map((variant) => ({ variantKey: variant.variantId })),
      })),
    );
    processResult.status = 'SUCCESS';

    return processResult;
  }

  private async processImmutableProductKeysUpsert(products: BatchProduct[], supplier: SupplierType) {
    // @todo implement later
  }

  async upsertSuppliedProducts(suppliedProducts: SuppliedProductInput[], supplier: SupplierType, batchTimestamp: Date) {
    const postProcessSuppliedProducts: SuppliedProductInput[] = [];
    for (const suppliedProduct of suppliedProducts) {
      const updatedSuppliedProduct = cloneDeep(suppliedProduct);

      // if the product is disabled, all its variants should be disabled as well
      if (suppliedProduct.state === 'DISABLED') {
        for (const updatedSuppliedProductVariant of updatedSuppliedProduct.variants) {
          updatedSuppliedProductVariant.state = 'DISABLED';
          updatedSuppliedProductVariant.inventory_quantity = 0;
          updatedSuppliedProductVariant.inventory_policy = 'deny';
        }

        postProcessSuppliedProducts.push(updatedSuppliedProduct);
        continue;
      }

      for (const updatedSuppliedProductVariant of updatedSuppliedProduct.variants) {
        // if variant is disabled, lets represent this as well by setting qty to 0
        if (updatedSuppliedProductVariant.state === 'DISABLED') {
          updatedSuppliedProductVariant.inventory_quantity = 0;
          updatedSuppliedProductVariant.inventory_policy = 'deny';
        }
      }

      postProcessSuppliedProducts.push(updatedSuppliedProduct);
    }

    await this.suppliedProductSyncService.upsertAll(postProcessSuppliedProducts, supplier, batchTimestamp);
  }
}
