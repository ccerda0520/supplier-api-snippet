import { Test, TestingModule } from '@nestjs/testing';
import { ProductController } from './product.controller';
import { PrismaService } from '../services/prisma.service';
import { BatchService } from '../services/batch.service';
import { SupplierService, SupplierType } from '../services/supplier.service';
import { SuppliedProductService } from '../services/suppliedProduct.service';
import { ProductBatchProcessor } from '../processors/productBatch.processor';
import { SupplierDB } from 'commons-ephesus/schemas/supplier-api/supplier.schema';
import { Batch, Prisma, PrismaClient } from 'commons-ephesus/generated/client';
import { BatchResult } from 'commons-ephesus/schemas/batch.schema';
import {
  SuppliedProductInput,
  fromBatchProductToSuppliedProductDbModel,
} from '../functions/mappers/suppliedProduct.mappers';
import {
  batchMany,
  batchSimple,
  batchSuccessWithProductDuplicateOptionsError,
  batchSuccessWithProductKeyDuplicateError,
  batchSuccessWithProductKeyNullError,
  batchSuccessWithProductNoOptionsError,
  batchSuccessWithProductNoProductKeyError,
  batchSuccessWithProductNoVariantKeyError,
  batchSuccessWithProductOptionsMissingError,
  batchSuccessWithProductOptionsNullError,
  batchSuccessWithProductOptionsSpecifiedVariantOptionsDontMatchError,
  batchSuccessWithProductOptionsSpecifiedVariantOptionsDuplicatedCaseInsensitiveError,
  batchSuccessWithProductOptionsSpecifiedVariantOptionsEmptyError,
  batchSuccessWithProductOptionsSpecifiedVariantOptionsNullError,
  batchSuccessWithProductSpecifiedVariantOptionsMissingError,
  batchSuccessWithVariantKeyDuplicateError,
  batchSuccessWithVariantKeyNullError,
  batchTooManyErrors,
} from './product.controller.data';
import { mockDeep } from 'jest-mock-extended';
import { Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import { generateZodMock } from 'commons-ephesus/functions/helpers/zod.helpers';
import { PusherService } from '../services/pusher.service';
import omit from 'lodash/fp/omit';
import { SuppliedProductSyncService } from '../services/product/suppliedProductSync.service';
import { LoggerService } from '../services/logger.service';
import CortinaClientSyncService from 'commons-ephesus/services/cortinaClientSync.service';

const SUPPLIER_ID = 'ac25904b-7070-4bb3-80cc-1d76063ae1b8';

describe('ProductController - Upsert Batch', () => {
  let productController: ProductController;
  let productBatchProcessor: ProductBatchProcessor;
  let supplierService: SupplierService;
  let batchService: BatchService;
  let suppliedProductService: SuppliedProductService;
  const mockSupplier = generateZodMock(SupplierDB);
  mockSupplier.id = SUPPLIER_ID;

  describe('Import Type: Immutable Variant Key', () => {
    mockSupplier.config.productsSyncSettings = {
      immutableVariantKey: true,
    };
    let currentBatch: Prisma.BatchUncheckedCreateInput;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        controllers: [ProductController],
        providers: [
          JwtService,
          PrismaService,
          BatchService,
          SupplierService,
          SuppliedProductService,
          PusherService,
          SuppliedProductSyncService,
          LoggerService,
          ProductBatchProcessor,
        ],
      })
        .overrideProvider(PrismaService)
        .useValue(mockDeep<PrismaClient>())
        .compile();

      productController = module.get<ProductController>(ProductController);
      productBatchProcessor = module.get<ProductBatchProcessor>(ProductBatchProcessor);
      supplierService = module.get<SupplierService>(SupplierService);
      batchService = module.get<BatchService>(BatchService);
      suppliedProductService = module.get<SuppliedProductService>(SuppliedProductService);

      jest
        .spyOn(CortinaClientSyncService.prototype, 'syncVendorToClientService')
        .mockImplementation(() => Promise.resolve());

      jest.spyOn(supplierService, 'getSupplierById').mockImplementation(async (id: string) => {
        if (id === SUPPLIER_ID) {
          return mockSupplier as unknown as SupplierType;
        }
        return null;
      });
      jest.spyOn(batchService, 'createBatch').mockImplementation(async (batch: Prisma.BatchUncheckedCreateInput) => {
        // We want the batch that is loaded from the batch processor to be the batch data passed when first created
        currentBatch = batch;
        return {
          ...(batch as unknown as Batch),
        };
      });
      jest.spyOn(batchService, 'getBatch').mockImplementation(async (id: string, supplierId: string) => {
        return currentBatch as Prisma.BatchGroupByOutputType;
      });
      jest
        .spyOn(batchService, 'updateBatch')
        .mockImplementation(async (id: string, batch: Prisma.BatchUncheckedUpdateInput) => {
          return {
            ...(batch as unknown as Batch),
          };
        });
      jest.spyOn(batchService, 'isLatestBatch').mockImplementation(async (date: Date) => {
        return true;
      });
      jest
        .spyOn(suppliedProductService, 'getSuppliedProductsBySupplierId')
        .mockImplementation(async (supplierId: string) => {
          return [];
        });
      jest
        .spyOn(productBatchProcessor, 'upsertSuppliedProducts')
        // @ts-ignore migrate to strictNullChecks
        .mockImplementation(
          async (suppliedProducts: SuppliedProductInput[], supplier: SupplierType, batchTimestamp: Date) => {
            // do something
          },
        );
    });

    it('should be a successful batch, 1 product, no errors', async () => {
      const batchResult = await productController.putUpsertBatch(
        {
          body: batchSimple,
          headers: {},
        },
        {
          supplier: mockSupplier,
        } as unknown as Request & { supplier: SupplierType },
      );

      expect(batchResult.status).toEqual(201);
      expect((batchResult.body as BatchResult).status).toEqual('SUCCESS');
      expect((batchResult.body as BatchResult)?.productsImportedCount).toEqual(1);
      expect((batchResult.body as BatchResult)?.productsNotImportedCount).toEqual(0);
    });

    it('should be a failed batch, too many errors in batch to process', async () => {
      const batchResult = await productController.putUpsertBatch(
        {
          body: batchTooManyErrors,
          headers: {},
        },
        {
          supplier: mockSupplier,
        } as unknown as Request & { supplier: SupplierType },
      );

      expect(batchResult.status).toEqual(422);
      expect((batchResult.body as BatchResult).status).toEqual('ERROR');
    });

    it('should be a successful batch, has 1 product error with product key null', async () => {
      const batchResult = await productController.putUpsertBatch(
        {
          body: batchSuccessWithProductKeyNullError,
          headers: {},
        },
        {
          supplier: mockSupplier,
        } as unknown as Request & { supplier: SupplierType },
      );

      expect(batchResult.status).toEqual(201);
      expect((batchResult.body as BatchResult).status).toEqual('SUCCESS');
      expect((batchResult.body as BatchResult)?.productsImportedCount).toEqual(3);
      expect((batchResult.body as BatchResult)?.productsNotImportedCount).toEqual(1);
    });

    it('should be a successful batch, has 1 product error with variant key null', async () => {
      const batchResult = await productController.putUpsertBatch(
        {
          body: batchSuccessWithVariantKeyNullError,
          headers: {},
        },
        {
          supplier: mockSupplier,
        } as unknown as Request & { supplier: SupplierType },
      );

      expect(batchResult.status).toEqual(201);
      expect((batchResult.body as BatchResult).status).toEqual('SUCCESS');
      expect((batchResult.body as BatchResult)?.productsImportedCount).toEqual(4);
      expect((batchResult.body as BatchResult)?.productsNotImportedCount).toEqual(1);
    });

    it('should be a successful batch, has 2 product errors with duplicate product keys', async () => {
      const batchResult = await productController.putUpsertBatch(
        {
          body: batchSuccessWithProductKeyDuplicateError,
          headers: {},
        },
        {
          supplier: mockSupplier,
        } as unknown as Request & { supplier: SupplierType },
      );

      expect(batchResult.status).toEqual(201);
      expect((batchResult.body as BatchResult).status).toEqual('SUCCESS');
      expect((batchResult.body as BatchResult)?.productsImportedCount).toEqual(4);
      expect((batchResult.body as BatchResult)?.productsNotImportedCount).toEqual(2);
    });

    it('should be a successful batch, has 2 product errors with duplicate variant keys', async () => {
      const batchResult = await productController.putUpsertBatch(
        {
          body: batchSuccessWithVariantKeyDuplicateError,
          headers: {},
        },
        {
          supplier: mockSupplier,
        } as unknown as Request & { supplier: SupplierType },
      );

      expect(batchResult.status).toEqual(201);
      expect((batchResult.body as BatchResult).status).toEqual('SUCCESS');
      expect((batchResult.body as BatchResult)?.productsImportedCount).toEqual(5);
      expect((batchResult.body as BatchResult)?.productsNotImportedCount).toEqual(2);
    });

    it('should be a successful batch, has 1 product error with duplicate options within product key', async () => {
      const batchResult = await productController.putUpsertBatch(
        {
          body: batchSuccessWithProductDuplicateOptionsError,
          headers: {},
        },
        {
          supplier: mockSupplier,
        } as unknown as Request & { supplier: SupplierType },
      );

      expect(batchResult.status).toEqual(201);
      expect((batchResult.body as BatchResult).status).toEqual('SUCCESS');
      expect((batchResult.body as BatchResult)?.productsImportedCount).toEqual(3);
      expect((batchResult.body as BatchResult)?.productsNotImportedCount).toEqual(1);
    });

    it('should be a successful batch, has 1 product error with no product key', async () => {
      const batchResult = await productController.putUpsertBatch(
        {
          body: batchSuccessWithProductNoProductKeyError,
          headers: {},
        },
        {
          supplier: mockSupplier,
        } as unknown as Request & { supplier: SupplierType },
      );

      expect(batchResult.status).toEqual(201);
      expect((batchResult.body as BatchResult).status).toEqual('SUCCESS');
      expect((batchResult.body as BatchResult)?.productsImportedCount).toEqual(3);
      expect((batchResult.body as BatchResult)?.productsNotImportedCount).toEqual(1);
    });

    it('should be a successful batch, has 1 product error with no variant key', async () => {
      const batchResult = await productController.putUpsertBatch(
        {
          body: batchSuccessWithProductNoVariantKeyError,
          headers: {},
        },
        {
          supplier: mockSupplier,
        } as unknown as Request & { supplier: SupplierType },
      );

      expect(batchResult.status).toEqual(201);
      expect((batchResult.body as BatchResult).status).toEqual('SUCCESS');
      expect((batchResult.body as BatchResult)?.productsImportedCount).toEqual(3);
      expect((batchResult.body as BatchResult)?.productsNotImportedCount).toEqual(1);
    });

    it('should be a successful batch, has 1 product error with product options empty, variant options specified', async () => {
      const batchResult = await productController.putUpsertBatch(
        {
          body: batchSuccessWithProductNoOptionsError,
          headers: {},
        },
        {
          supplier: mockSupplier,
        } as unknown as Request & { supplier: SupplierType },
      );

      expect(batchResult.status).toEqual(201);
      expect((batchResult.body as BatchResult).status).toEqual('SUCCESS');
      expect((batchResult.body as BatchResult)?.productsImportedCount).toEqual(3);
      expect((batchResult.body as BatchResult)?.productsNotImportedCount).toEqual(1);
    });

    it('should be a successful batch, has 1 product error with product options null, variant options specified', async () => {
      const batchResult = await productController.putUpsertBatch(
        {
          body: batchSuccessWithProductOptionsNullError,
          headers: {},
        },
        {
          supplier: mockSupplier,
        } as unknown as Request & { supplier: SupplierType },
      );

      expect(batchResult.status).toEqual(201);
      expect((batchResult.body as BatchResult).status).toEqual('SUCCESS');
      expect((batchResult.body as BatchResult)?.productsImportedCount).toEqual(3);
      expect((batchResult.body as BatchResult)?.productsNotImportedCount).toEqual(1);
    });

    it('should be a successful batch, has 1 product error with product options missing, variant options specified', async () => {
      const batchResult = await productController.putUpsertBatch(
        {
          body: batchSuccessWithProductOptionsMissingError,
          headers: {},
        },
        {
          supplier: mockSupplier,
        } as unknown as Request & { supplier: SupplierType },
      );

      expect(batchResult.status).toEqual(201);
      expect((batchResult.body as BatchResult).status).toEqual('SUCCESS');
      expect((batchResult.body as BatchResult)?.productsImportedCount).toEqual(3);
      expect((batchResult.body as BatchResult)?.productsNotImportedCount).toEqual(1);
    });

    it('should be a successful batch, has 1 product error with product options specified, variant options empty', async () => {
      const batchResult = await productController.putUpsertBatch(
        {
          body: batchSuccessWithProductOptionsSpecifiedVariantOptionsEmptyError,
          headers: {},
        },
        {
          supplier: mockSupplier,
        } as unknown as Request & { supplier: SupplierType },
      );

      expect(batchResult.status).toEqual(201);
      expect((batchResult.body as BatchResult).status).toEqual('SUCCESS');
      expect((batchResult.body as BatchResult)?.productsImportedCount).toEqual(3);
      expect((batchResult.body as BatchResult)?.productsNotImportedCount).toEqual(1);
    });

    it('should be a successful batch, has 1 product error with product options specified, variant options empty', async () => {
      const batchResult = await productController.putUpsertBatch(
        {
          body: batchSuccessWithProductOptionsSpecifiedVariantOptionsEmptyError,
          headers: {},
        },
        {
          supplier: mockSupplier,
        } as unknown as Request & { supplier: SupplierType },
      );

      expect(batchResult.status).toEqual(201);
      expect((batchResult.body as BatchResult).status).toEqual('SUCCESS');
      expect((batchResult.body as BatchResult)?.productsImportedCount).toEqual(3);
      expect((batchResult.body as BatchResult)?.productsNotImportedCount).toEqual(1);
    });

    it('should be a successful batch, has 1 product error with product options specified, variant options null', async () => {
      const batchResult = await productController.putUpsertBatch(
        {
          body: batchSuccessWithProductOptionsSpecifiedVariantOptionsNullError,
          headers: {},
        },
        {
          supplier: mockSupplier,
        } as unknown as Request & { supplier: SupplierType },
      );

      expect(batchResult.status).toEqual(201);
      expect((batchResult.body as BatchResult).status).toEqual('SUCCESS');
      expect((batchResult.body as BatchResult)?.productsImportedCount).toEqual(3);
      expect((batchResult.body as BatchResult)?.productsNotImportedCount).toEqual(1);
    });

    it('should be a successful batch, has 1 product error with product options specified, variant options misordered', async () => {
      const batchResult = await productController.putUpsertBatch(
        {
          body: batchSuccessWithProductOptionsSpecifiedVariantOptionsDontMatchError,
          headers: {},
        },
        {
          supplier: mockSupplier,
        } as unknown as Request & { supplier: SupplierType },
      );

      expect(batchResult.status).toEqual(201);
      expect((batchResult.body as BatchResult).status).toEqual('SUCCESS');
      expect((batchResult.body as BatchResult)?.productsImportedCount).toEqual(3);
      expect((batchResult.body as BatchResult)?.productsNotImportedCount).toEqual(1);
    });

    it('should be a successful batch, has 1 product error with product options specified, variant options duplicated case insensitive', async () => {
      const batchResult = await productController.putUpsertBatch(
        {
          body: batchSuccessWithProductOptionsSpecifiedVariantOptionsDuplicatedCaseInsensitiveError,
          headers: {},
        },
        {
          supplier: mockSupplier,
        } as unknown as Request & { supplier: SupplierType },
      );

      expect(batchResult.status).toEqual(201);
      expect((batchResult.body as BatchResult).status).toEqual('SUCCESS');
      expect((batchResult.body as BatchResult)?.productsImportedCount).toEqual(3);
      expect((batchResult.body as BatchResult)?.productsNotImportedCount).toEqual(1);
    });

    it('should be a successful batch, has 1 product error with product options specified, variant options missing', async () => {
      const batchResult = await productController.putUpsertBatch(
        {
          body: batchSuccessWithProductSpecifiedVariantOptionsMissingError,
          headers: {},
        },
        {
          supplier: mockSupplier,
        } as unknown as Request & { supplier: SupplierType },
      );

      expect(batchResult.status).toEqual(201);
      expect((batchResult.body as BatchResult).status).toEqual('SUCCESS');
      expect((batchResult.body as BatchResult)?.productsImportedCount).toEqual(3);
      expect((batchResult.body as BatchResult)?.productsNotImportedCount).toEqual(1);
    });

    it('should be a successful batch, has 1 product error where our records have more than variantKey entry for a supplier. Should not be possible but still should handle this as an error', async () => {
      const suppliedProductWithDuplicateVariantKeys = fromBatchProductToSuppliedProductDbModel(batchMany.products[0]);
      jest
        .spyOn(suppliedProductService, 'getSuppliedProductsBySupplierId')
        .mockImplementation(async (supplierId: string) => {
          return [
            {
              ...suppliedProductWithDuplicateVariantKeys,
              SuppliedProductVariants: [
                suppliedProductWithDuplicateVariantKeys.variants[0],
                suppliedProductWithDuplicateVariantKeys.variants[0],
              ],
            } as any,
          ];
        });

      const batchResult = await productController.putUpsertBatch(
        {
          body: batchMany,
          headers: {},
        },
        {
          supplier: mockSupplier,
        } as unknown as Request & { supplier: SupplierType },
      );

      expect(batchResult.status).toEqual(201);
      expect((batchResult.body as BatchResult).status).toEqual('SUCCESS');
      expect((batchResult.body as BatchResult)?.productsImportedCount).toEqual(4);
      expect((batchResult.body as BatchResult)?.productsNotImportedCount).toEqual(1);
    });

    it('should be a failed batch, supplier config set to include prices but they are missing', async () => {
      const supplierWithPriceEnabled = mockSupplier;
      supplierWithPriceEnabled.config.productsSyncSettings.hasPricing = true;

      const batchResult = await productController.putUpsertBatch(
        {
          body: {
            ...batchMany,
            products: batchMany.products.map((product) => ({
              ...product,
              variants: product.variants.map((variant) => omit('price', variant)),
            })),
          },
          headers: {},
        },
        {
          supplier: supplierWithPriceEnabled,
        } as unknown as Request & { supplier: SupplierType },
      );

      expect(batchResult.status).toEqual(422);
      expect((batchResult.body as BatchResult).status).toEqual('ERROR');
      expect((batchResult.body as BatchResult)?.productsImportedCount).toEqual(0);
      expect((batchResult.body as BatchResult)?.productsNotImportedCount).toEqual(5);
    });

    it('should be a failed batch, supplier config set to include inventory but they are missing', async () => {
      const supplierWithInventoryEnabled = mockSupplier;
      supplierWithInventoryEnabled.config.productsSyncSettings.hasInventory = true;

      const batchResult = await productController.putUpsertBatch(
        {
          body: {
            ...batchMany,
            products: batchMany.products.map((product) => ({
              ...product,
              variants: product.variants.map((variant) => omit('stock', variant)),
            })),
          },
          headers: {},
        },
        {
          supplier: supplierWithInventoryEnabled,
        } as unknown as Request & { supplier: SupplierType },
      );

      expect(batchResult.status).toEqual(422);
      expect((batchResult.body as BatchResult).status).toEqual('ERROR');
      expect((batchResult.body as BatchResult)?.productsImportedCount).toEqual(0);
      expect((batchResult.body as BatchResult)?.productsNotImportedCount).toEqual(5);
    });

    it('should be a failed batch, supplier config set to include wholesale pricing but they are missing', async () => {
      const supplierWithWholesalePricingEnabled = mockSupplier;
      supplierWithWholesalePricingEnabled.config.productsSyncSettings.hasWholesalePricing = true;

      const batchResult = await productController.putUpsertBatch(
        {
          body: batchMany,
          headers: {},
        },
        {
          supplier: supplierWithWholesalePricingEnabled,
        } as unknown as Request & { supplier: SupplierType },
      );

      expect(batchResult.status).toEqual(422);
      expect((batchResult.body as BatchResult).status).toEqual('ERROR');
      expect((batchResult.body as BatchResult)?.productsImportedCount).toEqual(0);
      expect((batchResult.body as BatchResult)?.productsNotImportedCount).toEqual(5);
    });

    it('should be a pending batch, supplier config set to async mode', async () => {
      const supplierWithAsyncEnabled = mockSupplier;
      supplierWithAsyncEnabled.config.productsSyncSettings.asyncMode = true;

      const batchResult = await productController.putUpsertBatch(
        {
          body: batchMany,
          headers: {},
        },
        {
          supplier: supplierWithAsyncEnabled,
        } as unknown as Request & { supplier: SupplierType },
      );

      expect(batchResult.status).toEqual(202);
      expect((batchResult.body as BatchResult).status).toEqual('PENDING');
      expect((batchResult.body as BatchResult)?.productsImportedCount).toEqual(null);
      expect((batchResult.body as BatchResult)?.productsNotImportedCount).toEqual(null);
    });
    // @todo write tests that involve checking against a real db
  });
});
