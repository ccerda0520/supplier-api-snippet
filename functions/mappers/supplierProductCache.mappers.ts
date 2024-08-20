import { BatchUpsertBody } from 'commons-ephesus/schemas/batch.schema';

export const fromEdiSupplierProductToUpsertApiBatch = (
  supplierProducts: Record<string, any>[],
  syncTimestamp: Date,
): BatchUpsertBody => {
  return {
    batch: {
      batchDate: syncTimestamp,
      batchName: `productBatch-${syncTimestamp.toISOString()}`,
    },
    products: supplierProducts.map((productData) => {
      const productOptions: string[] = [];
      productData.option1_name ? productOptions.push(productData.option1_name) : null;
      productData.option2_name ? productOptions.push(productData.option2_name) : null;
      productData.option3_name ? productOptions.push(productData.option3_name) : null;

      return {
        productKey: productData.handle,
        active: productData.status === 'active',
        name: productData.title,
        description: productData.body_html,
        brandName: productData.vendor,
        productType: productData.type,
        productKind: undefined,
        supplierURL: undefined,
        options: productOptions,
        productCategory: productData.product_category,
        tags: [productData.tags?.split(',').map((tag) => tag.trim())],
        images: productData.images
          ?.sort((a, b) => parseInt(a?.position) - parseInt(b?.position))
          .map((image) => ({
            url: image.src,
          })),
        customData: undefined,
        variants: productData.variants?.map((variant) => {
          const variantOptions: Record<string, string> = {};
          variant.option1_value ? (variantOptions[productOptions[0]] = variant.option1_value) : null;
          variant.option2_value ? (variantOptions[productOptions[1]] = variant.option2_value) : null;
          variant.option3_value ? (variantOptions[productOptions[2]] = variant.option3_value) : null;
          const variantWeightUnit = fromWeightUnit131SpecToUpsertApi(variant.weight_unit);
          const variantWeightValue = variant.grams
            ? fromWeightValue131SpecToUpsertApi(parseFloat(variant.grams), variantWeightUnit)
            : undefined;
          return {
            variantKey: variant.sku,
            active: true,
            name: Object.values(variantOptions).join(' / '),
            options: variantOptions,
            sku: variant.sku,
            barcode: variant.barcode ? { code: variant.barcode, codeType: 'UNKNOWN' } : undefined,
            mpn: undefined,
            price: {
              currency: 'USD',
              amount: variant.price,
            },
            compareAtPrice: {
              currency: 'USD',
              amount: variant.compare_at_price,
            },
            wholesalePrice: {
              currency: 'USD',
              amount: variant.wholesale_price,
            },
            shippingMeasurements: {
              weight: {
                unit: variantWeightUnit,
                value: variantWeightValue,
              },
            },
            stock: {
              quantity: variant.inventory_qty,
              unlimited: variant.inventory_policy === 'continue',
            },
            images: variant.image ? [{ url: variant.image }] : undefined,
            countryOfOriginCode: undefined,
            harmonizedCode: undefined,
          };
        }),
      };
    }),
  };
};

export const fromWeightUnit131SpecToUpsertApi = (unit: string) => {
  switch (unit) {
    case 'g':
      return 'GRAM';
    case 'kg':
      return 'KILOGRAM';
    case 'oz':
      return 'OUNCE';
    case 'lb':
      return 'POUND';
    default:
      return unit;
  }
};

export const fromWeightValue131SpecToUpsertApi = (grams: number, unit: string) => {
  switch (unit) {
    case 'GRAM':
      return grams;
    case 'KILOGRAM':
      return grams * 0.001;
    case 'OUNCE':
      return grams * 0.035274;
    case 'POUND':
      return grams * 0.00220462;
    default:
      return grams;
  }
};
