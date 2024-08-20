import { SupplierDB } from 'commons-ephesus/schemas/supplier-api/supplier.schema';
import { Prisma } from 'commons-ephesus/generated/client';
import { generateZodMock } from 'commons-ephesus/functions/helpers/zod.helpers';

export const SUPPLIER_ID = 'ac25904b-7070-4bb3-80cc-1d76063ae1b8';
export const BRAND_ID = 'ab25904b-7070-4bb3-80cc-1d76063ae1b8';

export const SUPPLIER_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImFjMjU5MDRiLTcwNzAtNGJiMy04MGNjLTFkNzYwNjNhZTFiOCIsImlhdCI6MTY5MjY2MjI2NX0.e_xKYSFH-yvmWyQQgsqtI3S1GLQD7d_3OSGWgSuECWM';

export const mockSupplier = {
  ...generateZodMock(SupplierDB),
  platform: 'EDI',
  name: 'supplier1',
  id: SUPPLIER_ID,
  config: {
    stockThreshold: '0',
    brands: ['test-edi-supplier'],
    multiBrandVendor: false,
    description: true,
    productsSyncSettings: {
      immutableVariantKey: true,
      hasPricing: true,
      hasInventory: true,
      // hasWholesalePricing: true,
      spcSyncEnabled: true,
    },
    orderTags: [],
    updatePrices: true,
    catalogSyncImages: true,
  },
};

export const mockBrand = {
  id: BRAND_ID,
  name: 'supplier1',
  inventoryThreshold: 0,
  shipsToPOBoxes: false,
  usesPackaging: false,
  vendorId: SUPPLIER_ID,
};

export const mockSuppliedProduct: Prisma.SuppliedProductGetPayload<null> = {
  body_html: '',
  brand: '',
  category: '',
  checkedOn: undefined,
  createdAt: undefined,
  customData: undefined,
  description: '',
  handle: '',
  id: 'aa73bbed-ab49-4852-b753-98cfa0130e4c',
  image: '',
  images: '',
  imported: false,
  manuallyImported: false,
  metafields: null,
  name: 'product 1',
  option1: '',
  option2: '',
  option3: '',
  options: '',
  price: 10,
  productId: 'product1',
  product_type: '',
  productKind: '',
  published_at: undefined,
  sku: 'product1',
  state: undefined,
  status: '',
  tags: '',
  updatedAt: undefined,
  vendorId: mockSupplier.id,
  vendorLink: '',
};

export const mockSuppliedProduct2: Prisma.SuppliedProductGetPayload<null> = {
  ...mockSuppliedProduct,
  id: '2f808f6a-2e83-43be-8903-7f24a56987d8',
  productId: 'product2',
  sku: 'product2',
};

export const mockSuppliedProductVariant: Prisma.SuppliedProductVariantGetPayload<{
  include: {
    SuppliedProduct: true;
  };
}> = {
  SuppliedProduct: mockSuppliedProduct,
  barcode: '',
  checkedOn: undefined,
  compare_at_price: 10,
  countryOfOriginCode: '',
  createdAt: undefined,
  fulfillment_service: '',
  generatedSku: 'cortina-712628',
  grams: 0,
  harmonizedCode: '',
  id: '3b0bd9a3-25b6-455f-b0ee-8a389b712628',
  image: '',
  image_id: '',
  images: '',
  inventory_item_id: '',
  inventory_management: '',
  inventory_policy: '',
  inventory_quantity: 10,
  metafields: null,
  name: '',
  old_inventory_quantity: 10,
  option1: '',
  option2: '',
  option3: '',
  price: 10,
  productId: '',
  requires_shipping: false,
  sku: 'variant1',
  state: 'ENABLED',
  suppliedProductId: '',
  isTaxable: false,
  taxCode: '',
  updatedAt: undefined,
  variantId: 'variant1',
  weight: 0,
  weight_unit: '',
  wholesalePrice: 10,
};

export const mockSuppliedProductVariant2: Prisma.SuppliedProductVariantGetPayload<{
  include: {
    SuppliedProduct: true;
  };
}> = {
  ...mockSuppliedProductVariant,
  id: '4e49b1a7-3ea0-4b11-8669-230bd5b6c55c',
  sku: 'variant2',
  SuppliedProduct: mockSuppliedProduct2,
  variantId: 'variant2',
};
