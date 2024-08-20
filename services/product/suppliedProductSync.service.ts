import { SuppliedProductService } from '../suppliedProduct.service';
import { SuppliedProductInput } from '../../functions/mappers/suppliedProduct.mappers';
import { SupplierType } from '../supplier.service';
import { PrismaService } from '../prisma.service';
import omit from 'lodash/fp/omit';
import { Prisma } from 'commons-ephesus/generated/client';
import pick from 'lodash/fp/pick';
import { PusherService } from '../pusher.service';
import { Injectable } from '@nestjs/common';
import { IsAmongPlatforms } from 'commons-ephesus/functions/predicates/config.predicates';
import { MarketplacePlatform } from 'commons-ephesus/types/enums';
import orderBy from 'lodash/orderBy';
import { getCleanImageUrl } from 'commons-ephesus/functions/helpers/shopify.helpers';
import { tryJsonParse } from 'commons-ephesus/functions/helpers/general.helpers';
import { IsValidImageUrl } from 'commons-ephesus/functions/predicates/shopify.predicates';
import { LogLevel } from 'commons-ephesus/utils/cloudWatch';
import { LoggerService } from '../logger.service';

@Injectable()
export class SuppliedProductSyncService {
  constructor(
    private prisma: PrismaService,
    private suppliedProductService: SuppliedProductService,
    private pusherService: PusherService,
    private loggerService: LoggerService,
  ) {}

  async upsertAll(suppliedProducts: SuppliedProductInput[], supplier: SupplierType, batchTimestamp: Date) {
    const suppliedProductIds: string[] = [];
    for (const suppliedProduct of suppliedProducts) {
      const suppliedProductId = await this.upsert(suppliedProduct, supplier);
      suppliedProductIds.push(suppliedProductId);
    }

    const disabledSuppliedProductIds = await this.suppliedProductService.disableMissingSuppliedProductsAndVariants(
      supplier,
      suppliedProductIds,
    );

    await this.disableImportedProductsAndVariants(disabledSuppliedProductIds, supplier.id);
  }

  async upsert(suppliedProduct: SuppliedProductInput, supplier: SupplierType) {
    const upsertedSuppliedProductId = await this.suppliedProductService.upsertSuppliedProduct(
      suppliedProduct,
      supplier,
    );

    const upsertedSuppliedProduct = await this.prisma.suppliedProduct.findFirst({
      where: { id: upsertedSuppliedProductId },
      include: { SuppliedProductVariants: true },
    });

    // this should not happen but you never know
    if (!upsertedSuppliedProduct) {
      throw new Error(`Could not find upserted supplied product with id: ${upsertedSuppliedProductId}`);
    }

    const existingVariantsToDeactivate = upsertedSuppliedProduct.SuppliedProductVariants?.filter((spv) => {
      return (
        spv.state === 'ENABLED' && !suppliedProduct.variants.find((variant) => spv.variantId === variant.variantId)
      );
    });

    if (existingVariantsToDeactivate.length) {
      await this.prisma.suppliedProductVariant.updateMany({
        data: {
          state: 'DISABLED',
          inventory_quantity: 0,
          inventory_policy: 'deny',
        },
        where: { id: { in: existingVariantsToDeactivate?.map((variant) => variant.id) } },
      });
    }

    await this.syncImportedProduct(upsertedSuppliedProductId, supplier);

    return upsertedSuppliedProductId;
  }

  async syncImportedProduct(suppliedProductId: string, supplier: SupplierType) {
    const suppliedProduct = await this.prisma.suppliedProduct.findFirst({
      where: { id: suppliedProductId },
      include: { SuppliedProductVariants: true },
    });

    // @todo do we care to find many here? there should only be one but who knows
    const importedProduct = await this.prisma.product.findFirst({
      where: {
        vendorId: suppliedProduct.vendorId,
        vendorProductId: suppliedProduct.productId,
        imported: true,
      },
      include: {
        ProductVariants: true,
      },
    });

    if (!importedProduct) {
      return;
    }

    const importedProductUpdate = this.getImportedProductUpdate(suppliedProduct, importedProduct);

    if (Object.keys(importedProductUpdate.data).length) {
      await this.prisma.product.update(importedProductUpdate);
    }

    // @todo probably handle this scenario at some point
    const variantsNew = [];

    for (const suppliedProductVariant of suppliedProduct?.SuppliedProductVariants) {
      const importedProductVariant = importedProduct.ProductVariants?.find(
        (variant) => variant.vendorVariantId === suppliedProductVariant.variantId,
      );

      // Variant is new and not part of imported product variants
      if (!importedProductVariant) {
        variantsNew.push(suppliedProductVariant);
        continue;
      }

      const importedVariantUpdate = this.getImportedVariantUpdate(
        suppliedProductVariant,
        importedProductVariant,
        supplier,
      );

      // Nothing to update
      if (!importedVariantUpdate || !Object.keys(importedVariantUpdate.data).length) {
        continue;
      }

      try {
        await this.prisma.productVariant.update(importedVariantUpdate);

        const inventoryPriceFields = pick(['qty', 'price', 'compareAtPrice', 'sku'], importedVariantUpdate.data);

        if (Object.keys(inventoryPriceFields).length) {
          await this.pusherService.sendVariantInventoryPricesUpdate(
            [
              {
                id: importedProductVariant.itemId || importedProductVariant.id,
                variantId: importedProductVariant.shopifyId,
                productId: importedProduct.vendorProductId,
                vendorVariantId: importedProductVariant.vendorVariantId,
                shopifyId: importedProduct.shopifyId,
                ...inventoryPriceFields,
                price: inventoryPriceFields.hasOwnProperty('price') ? Number(inventoryPriceFields.price) : undefined,
                compareAtPrice: inventoryPriceFields.hasOwnProperty('compareAtPrice')
                  ? Number(inventoryPriceFields.compareAtPrice)
                  : undefined,
                sku: inventoryPriceFields.hasOwnProperty('sku') ? (inventoryPriceFields.sku as string) : undefined,
                quantity: inventoryPriceFields.hasOwnProperty('qty') ? Number(inventoryPriceFields.qty) : undefined,
              },
            ],
            importedProduct.vendorId,
          );
        }
      } catch (e) {
        await this.loggerService.log(
          `Error while updating imported variant with vendor variant id ${suppliedProductVariant.variantId}: ${e.message}`,
          LogLevel.ERROR,
          e.stack,
        );
      }
    }

    // reusing image syncing logic from get available products, there is some pretty complex logic in here, dont want to recreate
    await this.syncImages({
      ...omit('SuppliedProductVariants', suppliedProduct),
      variants: suppliedProduct.SuppliedProductVariants,
    });
  }

  private async disableImportedProductsAndVariants(suppliedProductIds: string[], supplierId: string) {
    const suppliedProducts = await this.prisma.suppliedProduct.findMany({ where: { id: { in: suppliedProductIds } } });
    const importedProducts = await this.prisma.product.findMany({
      where: {
        vendorProductId: {
          in: suppliedProducts.map((sp) => sp.productId),
        },
        vendorId: supplierId,
      },
      include: {
        ProductVariants: true,
      },
    });

    const disabledAtDate = new Date();

    // disable all these products
    await this.prisma.product.updateMany({
      data: {
        state: 'DISABLED',
        disabledAt: disabledAtDate.toISOString(),
      },
      where: {
        id: { in: importedProducts.map((product) => product.id) },
      },
    });

    // disable each variant in the product and send pusher updates to merchant
    for (const importedProduct of importedProducts) {
      await this.prisma.productVariant.updateMany({
        data: { state: 'DISABLED', qty: 0, trackInventory: true, disabledAt: disabledAtDate.toISOString() },
        where: {
          id: { in: importedProduct.ProductVariants?.map((variant) => variant.id) },
        },
      });

      await this.pusherService.sendVariantStatusUpdate(
        importedProduct.ProductVariants?.map((variant) => ({
          isEnabledProducts: false,
          itemId: variant.itemId,
          productId: importedProduct.shopifyId,
          qty: 0,
        })),
        supplierId,
      );
    }
  }

  private getImportedProductUpdate(
    suppliedProduct: Prisma.SuppliedProductGetPayload<null>,
    importedProduct: Prisma.ProductGetPayload<null>,
  ): Prisma.ProductUpdateArgs {
    const importedProductUpdate: Prisma.ProductUpdateArgs = {
      data: {},
      where: {
        id: importedProduct.id,
      },
    };

    if (suppliedProduct.state !== importedProduct.state) {
      importedProductUpdate.data.state = suppliedProduct.state;

      if (suppliedProduct.state === 'ENABLED') {
        importedProductUpdate.data.disabledAt = null;
      } else {
        const disabledAtDate = new Date();
        importedProductUpdate.data.disabledAt = disabledAtDate.toISOString();
      }
    }

    // specific logic I found in get available products workflow
    if (IsAmongPlatforms(MarketplacePlatform.MERCHANT_API)) {
      importedProductUpdate.data.category = suppliedProduct.category;
      importedProductUpdate.data.productType = suppliedProduct.product_type;
    }

    return importedProductUpdate;
  }

  private getImportedVariantUpdate(
    suppliedProductVariant: Prisma.SuppliedProductVariantGetPayload<null>,
    importedProductVariant: Prisma.ProductVariantGetPayload<null>,
    supplier: SupplierType,
  ): Prisma.ProductVariantUpdateArgs {
    const importedVariantUpdate: Prisma.ProductVariantUpdateArgs = {
      data: {},
      where: {
        id: importedProductVariant.id,
      },
    };

    // change in variant status
    if (suppliedProductVariant.state !== importedProductVariant.state) {
      // We dont care about anything else since we need to disable the variant and set qty to 0
      if (suppliedProductVariant.state === 'DISABLED') {
        importedVariantUpdate.data.state = suppliedProductVariant.state;
        importedVariantUpdate.data.qty = 0;
        const disabledAtDate = new Date();
        importedVariantUpdate.data.disabledAt = disabledAtDate.toISOString();

        return importedVariantUpdate;
      }

      importedVariantUpdate.data.state = suppliedProductVariant.state;
      importedVariantUpdate.data.qty = suppliedProductVariant.inventory_quantity;
      importedVariantUpdate.data.disabledAt = null;
    }

    // change in inventory
    const stockThreshold = Number(supplier.config?.stockThreshold) || 0;
    // change in inventory policy, should allow unlimited stock
    if (suppliedProductVariant.inventory_policy === 'continue' && importedProductVariant.trackInventory === true) {
      importedVariantUpdate.data.trackInventory = false;
      importedVariantUpdate.data.qty = 1000;
    } // change in inventory policy, should allow limited stock now
    else if (suppliedProductVariant.inventory_policy === 'deny' && importedProductVariant.trackInventory === false) {
      importedVariantUpdate.data.trackInventory = true;
      const inventoryQuantity = suppliedProductVariant.inventory_quantity - stockThreshold;
      importedVariantUpdate.data.qty = inventoryQuantity >= 0 ? inventoryQuantity : 0;
    } // just a standard inventory change
    else if (
      suppliedProductVariant.inventory_quantity !== importedProductVariant.qty &&
      importedProductVariant.trackInventory
    ) {
      const inventoryQuantity = suppliedProductVariant.inventory_quantity - stockThreshold;
      importedVariantUpdate.data.qty = inventoryQuantity >= 0 ? inventoryQuantity : 0;
    }

    // change in price
    if (suppliedProductVariant.price !== importedProductVariant.price && supplier.config?.updatePrices) {
      importedVariantUpdate.data.price = suppliedProductVariant.price;
    }

    // change in compare price
    if (suppliedProductVariant.compare_at_price !== importedProductVariant.compareAtPrice) {
      importedVariantUpdate.data.compareAtPrice = suppliedProductVariant.compare_at_price;
    }

    // change in sku
    // @todo merge in usegeneratedskus logic and add it as a conditional, dont update product sku if we are using generated skus
    if (suppliedProductVariant.sku !== importedProductVariant.sku) {
      importedVariantUpdate.data.sku = suppliedProductVariant.sku;
    }

    return importedVariantUpdate;
  }

  async syncImages(suppliedProduct: SuppliedProductInput) {
    const images = [];

    try {
      const vendor = await this.prisma.vendor.findUnique({
        where: {
          id: suppliedProduct.vendorId,
        },
        select: {
          config: true,
          id: true,
        },
      });

      const parsedConfig = JSON.parse(vendor.config);
      const catalogSyncImages = parsedConfig.catalogSyncImages;

      if (!catalogSyncImages) {
        return;
      }

      const cortinaProduct = await this.prisma.product.findFirst({
        where: {
          vendorProductId: suppliedProduct.productId,
        },
        select: {
          id: true,
          shopifyId: true,
          vendorProductId: true,
          image: true,
          ProductVariants: {
            select: {
              id: true,
              vendorVariantId: true,
              image: true,
              shopifyId: true,
            },
          },
        },
      });

      if (cortinaProduct) {
        // These are comma-separated lists of image URLs
        const parsedSuppliedProductImages = JSON.parse(suppliedProduct.images);
        const incomingImgSrcList: string = parsedSuppliedProductImages
          ?.map((image) => image.url || image.src)
          .join(',');
        const existingImgSrcList: string = cortinaProduct?.image;
        const productImagesChanged = incomingImgSrcList !== existingImgSrcList;
        let hasVariantImageChange = false;

        // We have some inconsistent shapes in our DB.
        // This try/catch is to ensure if the image is a string rather than a JSONB
        // we don't crash the sync
        try {
          const incomingVariantsArray = orderBy(suppliedProduct.variants, 'variantId').map((variant) => {
            const images = tryJsonParse<{ url: string }[]>(variant.images);
            const image = images?.[0];
            if (!image?.url) {
              return null;
            }
            return getCleanImageUrl(image.url);
          });
          const existingVariantsArray = orderBy(cortinaProduct.ProductVariants, 'vendorVariantId').map((variant) => {
            const image = tryJsonParse<{ src: string }>(variant.image);
            if (!image?.src) {
              return null;
            }
            return getCleanImageUrl(image.src);
          });
          if (JSON.stringify(incomingVariantsArray) !== JSON.stringify(existingVariantsArray)) {
            hasVariantImageChange = true;
          }
        } catch (error) {
          throw error;
        }

        if (productImagesChanged || hasVariantImageChange) {
          await this.prisma.product.update({
            where: {
              id: cortinaProduct.id,
            },
            data: {
              image: incomingImgSrcList,
              // Not sure why this isn't being applied to all merchant types 🤷‍
              ...(IsAmongPlatforms(MarketplacePlatform.MERCHANT_API) && {
                vendorImages: JSON.stringify(suppliedProduct.images),
              }),
            },
          });

          const variantImageMap: Record<string, string> = {};

          for (const cortinaVariant of cortinaProduct.ProductVariants) {
            const matchingVariant = suppliedProduct.variants.find(
              (variant: Record<string, any>) => variant.variantId?.toString() === cortinaVariant.vendorVariantId,
            );
            if (matchingVariant) {
              const parsedSuppliedProductImages = JSON.parse(suppliedProduct.images);
              const parsedVariantImages = JSON.parse(matchingVariant.images);

              // Only accepting 1 image for a variant right now
              const variantImage = parsedVariantImages?.[0];
              const imageExistsInProduct = parsedSuppliedProductImages?.find(
                (image: Record<string, any>) => image && image.url === variantImage?.url,
              );

              // we use src not url in our db
              if (variantImage) {
                variantImage.src = variantImage.url;
                delete variantImage.url;
              }

              // Ensure we update the image in the productVariant table as a JSON object
              const imageUpdate = imageExistsInProduct && variantImage ? JSON.stringify(variantImage) : null;
              await this.prisma.productVariant.update({
                where: {
                  id: cortinaVariant.id,
                },
                data: {
                  image: imageUpdate,
                },
              });
              // Sometimes we get images as a string, sometimes as an object. Find whichever one has the src
              const imageSrc = variantImage?.src ?? null;
              // Only add the image to the map if it exists and is a valid URL
              if (imageUpdate && cortinaVariant.shopifyId && imageSrc && IsValidImageUrl(imageSrc)) {
                variantImageMap[cortinaVariant.shopifyId] = imageSrc;
              }
            }
          }

          // Ensure we don't send messages without a productId
          if (cortinaProduct.shopifyId) {
            const productImages: Record<string, any> = {
              variantImageMap,
              productId: cortinaProduct.shopifyId,
              images: incomingImgSrcList,
            };
            images.push(productImages);
            if (!IsAmongPlatforms(MarketplacePlatform.MERCHANT_API)) {
              await this.pusherService.sendProductImages(images, suppliedProduct.vendorId);
            }
          }
        }
      }
    } catch (e) {
      throw e;
    }
  }
}
