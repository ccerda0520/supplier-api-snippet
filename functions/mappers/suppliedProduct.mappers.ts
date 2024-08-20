import { BatchProduct, BatchProductVariant } from 'commons-ephesus/schemas/supplier-api/product.schema';
import { Prisma } from 'commons-ephesus/generated/client';
import startCase from 'lodash/fp/startCase';
import { omitNull } from 'commons-ephesus/functions/helpers/general.helpers';

export type SuppliedProductInput = Omit<Prisma.SuppliedProductCreateInput, 'SuppliedProductVariants' | 'Vendor'> & {
  variants: Prisma.SuppliedProductVariantCreateWithoutSuppliedProductInput[];
  vendorId?: string;
};

export type ProductInput = Omit<Prisma.ProductCreateInput, 'ProductVariants' | 'Vendor'> & {
  variants: Prisma.ProductVariantCreateWithoutProductInput[];
  vendorId?: string;
};

const toImageList = (images: BatchProduct['images'] | BatchProductVariant['images']) => {
  return JSON.stringify(images.map((i) => ({ ...i, src: i.url })));
};

export const fromBatchProductToSuppliedProductDbModel = (batchProduct: BatchProduct): SuppliedProductInput => {
  return {
    body_html: batchProduct.description ?? null,
    brand: batchProduct.brandName ?? null,
    customData: batchProduct.customData,
    description: batchProduct.description ?? null,
    images: batchProduct.images ? toImageList(batchProduct.images) : null,
    name: batchProduct.name,
    option1: batchProduct.options?.[0] ?? null,
    option2: batchProduct.options?.[1] ?? null,
    option3: batchProduct.options?.[2] ?? null,
    options: batchProduct.options ? JSON.stringify(batchProduct.options) : null,
    category: batchProduct.productCategory ?? null,
    productId: batchProduct.productKey,
    product_type: batchProduct.productType ?? null,
    productKind: batchProduct.productKind ?? null,
    state: batchProduct.active ? 'ENABLED' : 'DISABLED',
    status: batchProduct.active ? 'active' : 'inactive',
    tags: batchProduct.tags ? JSON.stringify(batchProduct.tags) : null,
    variants: batchProduct?.variants.map((variant) =>
      fromBatchProductVariantToSuppliedProductVariantDbModel(batchProduct, variant),
    ),
  };
};

export const fromBatchProductVariantToSuppliedProductVariantDbModel = (
  batchProduct: BatchProduct,
  batchProductVariant: BatchProductVariant,
): Prisma.SuppliedProductVariantCreateWithoutSuppliedProductInput => {
  const option1 =
    batchProduct.options?.[0] && typeof batchProductVariant.options === 'object' && batchProductVariant.options !== null
      ? batchProductVariant.options[batchProduct.options[0]]
      : null;
  const option2 =
    batchProduct.options?.[1] && typeof batchProductVariant.options === 'object' && batchProductVariant.options !== null
      ? batchProductVariant.options[batchProduct.options[1]]
      : null;
  const option3 =
    batchProduct.options?.[2] && typeof batchProductVariant.options === 'object' && batchProductVariant.options !== null
      ? batchProductVariant.options[batchProduct.options[2]]
      : null;

  return {
    barcode: JSON.stringify(batchProductVariant.barcode) ?? null,
    compare_at_price: batchProductVariant.compareToPrice?.amount ?? null,
    countryOfOriginCode: batchProductVariant.countryOfOriginCode ?? null,
    harmonizedCode: batchProductVariant.harmonizedCode ?? null,
    image_id: batchProductVariant.images?.[0]?.id ?? null,
    images: batchProductVariant.images ? toImageList(batchProductVariant.images) : null,
    inventory_policy: batchProductVariant.stock?.unlimited ? 'continue' : 'deny',
    inventory_quantity: batchProductVariant.stock?.quantity ?? null,
    name: Object.values(omitNull({ option1, option2, option3 })).join(' / '),
    option1,
    option2,
    option3,
    price: batchProductVariant.price?.amount ? Number(batchProductVariant.price?.amount) : null,
    productId: batchProduct.productKey,
    requires_shipping: true,
    sku: batchProductVariant.sku,
    state: batchProductVariant.active ? 'ENABLED' : 'DISABLED',
    isTaxable: true,
    variantId: batchProductVariant.variantKey,
    weight: batchProductVariant.shippingMeasurements?.weight?.value ?? null,
    weight_unit: batchProductVariant.shippingMeasurements?.weight?.unit ?? null,
    wholesalePrice: batchProductVariant.wholesalePrice?.amount ?? null,
  };
};

// @todo make this more thorough, but really just for test purposes
export const fromSuppliedProductToProductDbModel = (suppliedProduct: SuppliedProductInput): ProductInput => ({
  brandName: suppliedProduct.brand,
  category: suppliedProduct.category,
  description: suppliedProduct.description,
  handle: suppliedProduct.handle,
  image: suppliedProduct.images
    ? JSON.parse(suppliedProduct.images)
        ?.map((image) => image.url)
        ?.join(',')
    : null,
  metafields: null,
  name: suppliedProduct.name,
  option1: suppliedProduct.option1,
  option2: suppliedProduct.option2,
  option3: suppliedProduct.option3,
  productType: suppliedProduct.product_type,
  sku: suppliedProduct.sku,
  state: suppliedProduct.state,
  variants: suppliedProduct.variants.map((suppliedProductVariant) =>
    fromSuppliedProductVariantToProductVariantDbModel(suppliedProduct, suppliedProductVariant),
  ),
  vendorProductId: suppliedProduct.productId,
});

// @todo make this more thorough, but really just for test purposes
export const fromSuppliedProductVariantToProductVariantDbModel = (
  suppliedProduct: SuppliedProductInput,
  suppliedProductVariant: Prisma.SuppliedProductVariantCreateWithoutSuppliedProductInput,
): Prisma.ProductVariantCreateWithoutProductInput => ({
  compareAtPrice: suppliedProductVariant.compare_at_price,
  countryOfOriginCode: suppliedProductVariant.countryOfOriginCode,
  harmonizedCode: suppliedProductVariant.harmonizedCode,
  grams: 0,
  image: suppliedProductVariant.images
    ? JSON.stringify({ src: JSON.parse(suppliedProductVariant.images)?.[0]?.url })
    : null,
  metafields: suppliedProductVariant.metafields,
  name: Object.values(suppliedProduct.options).join(' / '),
  option1: suppliedProductVariant.option1,
  option2: suppliedProductVariant.option2,
  option3: suppliedProductVariant.option3,
  price: suppliedProductVariant.price,
  qty: suppliedProductVariant.inventory_quantity,
  sku: suppliedProductVariant.sku || suppliedProductVariant.generatedSku,
  state: suppliedProductVariant.state,
  trackInventory: suppliedProductVariant.inventory_policy !== 'continue',
  vendorInventoryId: suppliedProductVariant.inventory_item_id,
  vendorVariantId: suppliedProductVariant.variantId,
  wholesalePrice: suppliedProductVariant.wholesalePrice,
});
