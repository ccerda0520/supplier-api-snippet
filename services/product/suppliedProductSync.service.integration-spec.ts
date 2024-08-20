import { SupplierService, SupplierType } from '../supplier.service';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import { Test, TestingModule } from '@nestjs/testing';
import { mockBrand, mockSupplier } from '../../constants/test.constants';
import { SuppliedProductSyncService } from './suppliedProductSync.service';
import {
  fromBatchProductToSuppliedProductDbModel,
  fromSuppliedProductToProductDbModel,
  fromSuppliedProductVariantToProductVariantDbModel,
  ProductInput,
} from '../../functions/mappers/suppliedProduct.mappers';
import { batchMany } from '../../controllers/product.controller.data';
import { SuppliedProductService } from '../suppliedProduct.service';
import { PusherService } from '../pusher.service';
import omit from 'lodash/fp/omit';
import { mockDeep } from 'jest-mock-extended';
import { LoggerService } from '../logger.service';
import CortinaClientSyncService from 'commons-ephesus/services/cortinaClientSync.service';

describe('Supplied Product Sync', () => {
  let supplierService: SupplierService;
  let prisma: PrismaService;
  let suppliedProductSyncService: SuppliedProductSyncService;
  let supplier: SupplierType;
  const suppliedProducts = batchMany.products.map((product) => fromBatchProductToSuppliedProductDbModel(product));

  const suppliedProduct1 = suppliedProducts[0];
  let suppliedProduct1Id: string;
  let product: ProductInput;

  const createProduct = async () => {
    const createdProduct = await prisma.product.create({
      data: {
        ...omit('variants', fromSuppliedProductToProductDbModel(suppliedProduct1)),
        vendorId: supplier.id as unknown as never,
        imported: true,
      },
    });

    product = { ...createdProduct, variants: [] };
    for (const variant of suppliedProduct1.variants) {
      const createdVariant = await prisma.productVariant.create({
        data: {
          ...fromSuppliedProductVariantToProductVariantDbModel(suppliedProduct1, variant),
          productId: createdProduct.id,
        },
      });

      product.variants.push(createdVariant);
    }
  };

  const resetProduct = async () => {
    // reset state of supplied Product
    await suppliedProductSyncService.upsert(suppliedProduct1, supplier);

    // reset state of imported product
    await prisma.product.update({
      data: {
        ...omit('variants', fromSuppliedProductToProductDbModel(suppliedProduct1)),
        vendorId: supplier.id as unknown as never,
        imported: true,
      },
      where: { id: product.id },
    });

    for (const [index, variant] of product.variants.entries()) {
      await prisma.productVariant.update({
        data: {
          ...fromSuppliedProductVariantToProductVariantDbModel(suppliedProduct1, suppliedProduct1.variants[index]),
        },
        where: { id: variant.id },
      });
    }
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtService,
        PrismaService,
        SupplierService,
        SuppliedProductService,
        PusherService,
        SuppliedProductSyncService,
        LoggerService,
      ],
    })
      .overrideProvider(PusherService)
      .useValue(mockDeep<PusherService>())
      .compile();

    supplierService = module.get<SupplierService>(SupplierService);
    prisma = module.get<PrismaService>(PrismaService);
    suppliedProductSyncService = module.get<SuppliedProductSyncService>(SuppliedProductSyncService);

    jest
      .spyOn(CortinaClientSyncService.prototype, 'syncVendorToClientService')
      .mockImplementation(() => Promise.resolve());

    await prisma.vendor.create({
      data: {
        ...mockSupplier,
        config: JSON.stringify(mockSupplier.config),
        auth: JSON.stringify(mockSupplier.auth),
      },
    });

    await prisma.brand.create({
      data: mockBrand,
    });

    supplier = await supplierService.getSupplierById(mockSupplier.id);
  });

  describe('Upsert', () => {
    describe('New Supplied Product', () => {
      it('should create the supplied product/variants and their fields correctly', async () => {
        suppliedProduct1Id = await suppliedProductSyncService.upsert(suppliedProduct1, supplier);
        const foundSuppliedProduct1 = await prisma.suppliedProduct.findFirst({
          where: { id: suppliedProduct1Id },
          include: { SuppliedProductVariants: true },
        });
        expect(suppliedProduct1Id).toBeTruthy();
        expect(foundSuppliedProduct1.name).toEqual(suppliedProduct1.name);
        expect(foundSuppliedProduct1.status).toEqual(suppliedProduct1.status);
        expect(foundSuppliedProduct1.SuppliedProductVariants.length).toEqual(suppliedProduct1.variants.length);
      });
    });

    describe('Update Existing Supplied Product', () => {
      beforeAll(async () => {
        await createProduct();
      });

      describe('Updated Product - Non Essential Change', () => {
        it('should update fields in supplied product, should NOT update in imported product', async () => {
          const updatedSuppliedProduct1 = {
            ...suppliedProduct1,
            name: 'updated product1',
          };
          await suppliedProductSyncService.upsert(updatedSuppliedProduct1, supplier);

          const foundUpdatedSuppliedProduct1 = await prisma.suppliedProduct.findFirst({
            where: { id: suppliedProduct1Id },
          });
          expect(foundUpdatedSuppliedProduct1.name).toEqual(updatedSuppliedProduct1.name);

          const foundUpdatedProduct1 = await prisma.product.findFirst({
            where: { id: product.id },
          });
          expect(foundUpdatedProduct1.name).not.toEqual(foundUpdatedSuppliedProduct1.name);
        });
      });

      describe('Deleted Variant', () => {
        beforeAll(async () => await resetProduct());

        it('should disable the variant, in both supplied product and imported product', async () => {
          const foundSuppliedProduct1 = await prisma.suppliedProduct.findFirst({
            where: { id: suppliedProduct1Id },
            include: { SuppliedProductVariants: true },
          });
          expect(foundSuppliedProduct1.SuppliedProductVariants.every((variant) => variant.state === 'ENABLED')).toEqual(
            true,
          );

          const updatedSuppliedProductWithMissingVariant = {
            ...suppliedProduct1,
            variants: [suppliedProduct1.variants[0]],
          };
          await suppliedProductSyncService.upsert(updatedSuppliedProductWithMissingVariant, supplier);
          const foundUpdatedSuppliedProductWithMissingVariant = await prisma.suppliedProduct.findFirst({
            where: { id: suppliedProduct1Id },
            include: { SuppliedProductVariants: true },
          });
          const deletedSuppliedProductVariant =
            foundUpdatedSuppliedProductWithMissingVariant.SuppliedProductVariants.find(
              (variant) => variant.variantId === suppliedProduct1.variants[1].variantId,
            );
          expect(deletedSuppliedProductVariant.state).toEqual('DISABLED');
          expect(deletedSuppliedProductVariant.inventory_quantity).toEqual(0);
          expect(deletedSuppliedProductVariant.inventory_policy).toEqual('deny');

          const foundUpdatedProductWithMissingVariant = await prisma.product.findFirst({
            where: { id: product.id },
            include: { ProductVariants: true },
          });
          const deletedProductVariant = foundUpdatedProductWithMissingVariant.ProductVariants.find(
            (variant) => variant.vendorVariantId === deletedSuppliedProductVariant.variantId,
          );
          expect(deletedProductVariant.state).toEqual('DISABLED');
          expect(deletedProductVariant.qty).toEqual(0);
          expect(deletedProductVariant.trackInventory).toEqual(true);
        });

        it('should enable the variant if added back, in both supplied product and imported product', async () => {
          // perform update
          await suppliedProductSyncService.upsert(suppliedProduct1, supplier);

          // check to see the supplied product is accurate
          const foundUpdatedSuppliedProductWithReaddedVariant = await prisma.suppliedProduct.findFirst({
            where: { id: suppliedProduct1Id },
            include: { SuppliedProductVariants: true },
          });
          const readdedSuppliedProductVariant =
            foundUpdatedSuppliedProductWithReaddedVariant.SuppliedProductVariants.find(
              (variant) => variant.variantId === suppliedProduct1.variants[1].variantId,
            );
          expect(readdedSuppliedProductVariant.state).toEqual(suppliedProduct1.variants[1].state);
          expect(readdedSuppliedProductVariant.inventory_quantity).toEqual(
            suppliedProduct1.variants[1].inventory_quantity,
          );
          expect(readdedSuppliedProductVariant.inventory_policy).toEqual(suppliedProduct1.variants[1].inventory_policy);

          // check to see the imported product is accurate
          const foundUpdatedProductWithReaddedVariant = await prisma.product.findFirst({
            where: { id: product.id },
            include: { ProductVariants: true },
          });
          const readdedProductVariant = foundUpdatedProductWithReaddedVariant.ProductVariants.find(
            (variant) => variant.vendorVariantId === readdedSuppliedProductVariant.variantId,
          );
          expect(readdedProductVariant.state).toEqual(readdedSuppliedProductVariant.state);
          expect(readdedProductVariant.qty).toEqual(readdedSuppliedProductVariant.inventory_quantity);
          expect(readdedProductVariant.trackInventory).toEqual(
            readdedSuppliedProductVariant.inventory_policy === 'deny',
          );
        });
      });

      describe('Updated Variant Inventory', () => {
        beforeAll(async () => await resetProduct());

        it('should update variant inventory amount in both supplied and imported product', async () => {
          // perform update
          await suppliedProductSyncService.upsert(
            {
              ...suppliedProduct1,
              variants: suppliedProduct1.variants.map((variant) => ({ ...variant, inventory_quantity: 20 })),
            },
            supplier,
          );

          // check to see the supplied product is accurate
          const foundUpdatedSuppliedProduct = await prisma.suppliedProduct.findFirst({
            where: { id: suppliedProduct1Id },
            include: { SuppliedProductVariants: true },
          });

          expect(
            foundUpdatedSuppliedProduct.SuppliedProductVariants?.every((variant) => variant.inventory_quantity === 20),
          ).toEqual(true);

          // check to see the imported product is accurate
          const updatedProduct = await prisma.product.findFirst({
            where: { id: product.id },
            include: { ProductVariants: true },
          });

          expect(updatedProduct.ProductVariants?.every((variant) => variant.qty === 20)).toEqual(true);
        });

        it('should set inventory amount to 1000 if variant has inventory policy continue, in both supplied and imported product', async () => {
          // perform update
          await suppliedProductSyncService.upsert(
            {
              ...suppliedProduct1,
              variants: suppliedProduct1.variants.map((variant) => ({ ...variant, inventory_policy: 'continue' })),
            },
            supplier,
          );

          // check to see the supplied product is accurate
          const foundUpdatedSuppliedProduct = await prisma.suppliedProduct.findFirst({
            where: { id: suppliedProduct1Id },
            include: { SuppliedProductVariants: true },
          });

          expect(
            foundUpdatedSuppliedProduct.SuppliedProductVariants?.every(
              (variant) => variant.inventory_policy === 'continue',
            ),
          ).toEqual(true);

          // check to see the imported product is accurate
          const updatedProduct = await prisma.product.findFirst({
            where: { id: product.id },
            include: { ProductVariants: true },
          });

          expect(updatedProduct.ProductVariants?.every((variant) => variant.trackInventory === false)).toEqual(true);
          expect(updatedProduct.ProductVariants?.every((variant) => variant.qty === 1000)).toEqual(true);
        });
      });

      describe('Update Images', () => {
        beforeAll(async () => await resetProduct());
        it('should update images, in both supplied and imported product', async () => {
          const currentImages = JSON.parse(suppliedProduct1.images);
          const updatedImages = JSON.stringify([currentImages?.[1]]);
          // perform update
          await suppliedProductSyncService.upsert(
            {
              ...suppliedProduct1,
              images: updatedImages,
              variants: suppliedProduct1.variants.map((variant) => ({ ...variant, images: updatedImages })),
            },
            supplier,
          );

          // check to see the supplied product is accurate
          const foundUpdatedSuppliedProduct = await prisma.suppliedProduct.findFirst({
            where: { id: suppliedProduct1Id },
            include: { SuppliedProductVariants: true },
          });

          expect(foundUpdatedSuppliedProduct.images).toEqual(updatedImages);
          expect(foundUpdatedSuppliedProduct.SuppliedProductVariants?.[0].images).toEqual(updatedImages);

          // check to see the imported product is accurate
          const updatedProduct = await prisma.product.findFirst({
            where: { id: product.id },
            include: { ProductVariants: true },
          });

          expect(updatedProduct.image).toEqual(currentImages?.[1].url);
          expect(JSON.parse(updatedProduct.ProductVariants?.[0]?.image)?.src).toEqual(currentImages?.[1].url);
        });
      });

      describe('Disabled Variant', () => {
        beforeAll(async () => await resetProduct());

        it('should set variant state to disabled for supplied product, and set inventory to 0 for imported product', async () => {
          // perform update
          await suppliedProductSyncService.upsert(
            {
              ...suppliedProduct1,
              variants: suppliedProduct1.variants.map((variant) => ({ ...variant, state: 'DISABLED' })),
            },
            supplier,
          );

          // check to see the supplied product is accurate
          const foundUpdatedSuppliedProduct = await prisma.suppliedProduct.findFirst({
            where: { id: suppliedProduct1Id },
            include: { SuppliedProductVariants: true },
          });

          expect(
            foundUpdatedSuppliedProduct.SuppliedProductVariants?.every((variant) => variant.state === 'DISABLED'),
          ).toEqual(true);

          // check to see the imported product is accurate
          const updatedProduct = await prisma.product.findFirst({
            where: { id: product.id },
            include: { ProductVariants: true },
          });

          expect(updatedProduct.ProductVariants?.every((variant) => variant.state === 'DISABLED')).toEqual(true);
          expect(updatedProduct.ProductVariants?.every((variant) => variant.trackInventory === true)).toEqual(true);
          expect(updatedProduct.ProductVariants?.every((variant) => variant.qty === 0)).toEqual(true);
        });
      });

      describe('New Variant', () => {
        beforeAll(async () => await resetProduct());

        it('should create new supplied product variant, and NOT create new imported product variant', async () => {
          const allVariants = [
            ...suppliedProduct1.variants,
            {
              ...suppliedProduct1.variants[0],
              sku: `${suppliedProduct1.variants[0].sku}-new`,
              variantId: `${suppliedProduct1.variants[0].variantId}-new`,
            },
          ];

          // perform update
          await suppliedProductSyncService.upsert(
            {
              ...suppliedProduct1,
              variants: allVariants,
            },
            supplier,
          );

          // check to see the supplied product is accurate
          const foundUpdatedSuppliedProduct = await prisma.suppliedProduct.findFirst({
            where: { id: suppliedProduct1Id },
            include: { SuppliedProductVariants: true },
          });

          expect(foundUpdatedSuppliedProduct.SuppliedProductVariants.length).toEqual(allVariants.length);

          // check to see the imported product is accurate
          const updatedProduct = await prisma.product.findFirst({
            where: { id: product.id },
            include: { ProductVariants: true },
          });

          expect(updatedProduct.ProductVariants.length).not.toEqual(allVariants.length);
        });
      });
    });
  });

  describe('Upsert All', () => {
    describe('All New Supplied Products', () => {
      beforeAll(async () => {
        const products = await prisma.product.findMany({ where: { vendorId: supplier.id } });
        const productIds = products.map((product) => product.id);
        await prisma.productVariant.deleteMany({ where: { productId: { in: productIds } } });
        await prisma.product.deleteMany({ where: { id: { in: productIds } } });

        const suppliedProducts = await prisma.suppliedProduct.findMany({ where: { vendorId: supplier.id } });
        const suppliedProductIds = suppliedProducts.map((product) => product.id);
        await prisma.suppliedProductVariant.deleteMany({ where: { suppliedProductId: { in: suppliedProductIds } } });
        await prisma.suppliedProduct.deleteMany({ where: { id: { in: suppliedProductIds } } });
      });

      it('should create all the supplied products correctly', async () => {
        await suppliedProductSyncService.upsertAll(suppliedProducts, supplier, new Date());
        const createdSuppliedProducts = await prisma.suppliedProduct.findMany({ where: { vendorId: supplier.id } });
        expect(createdSuppliedProducts.length).toEqual(suppliedProducts.length);
      });
    });

    describe('Updates to Existing Supplied Products', () => {
      beforeAll(async () => {
        await createProduct();
      });
      it('should disable supplied and imported products if not part of the batch and exists in our system', async () => {
        const removedProduct = suppliedProducts[0];
        const updateDate = new Date();
        updateDate.setDate(updateDate.getDate() + 1);
        await suppliedProductSyncService.upsertAll(suppliedProducts.slice(1), supplier, updateDate);
        const foundSuppliedProducts = await prisma.suppliedProduct.findMany({ where: { vendorId: supplier.id } });
        const disabledSuppliedProduct = foundSuppliedProducts.find(
          (suppliedProduct) => suppliedProduct.productId === removedProduct.productId,
        );
        expect(foundSuppliedProducts.length).toEqual(suppliedProducts.length);
        expect(disabledSuppliedProduct.state).toEqual('DISABLED');
      });
    });
  });
});
