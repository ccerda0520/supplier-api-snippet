import {
  BatchProduct,
  BatchProductError,
  BatchProductVariantError,
} from 'commons-ephesus/schemas/supplier-api/product.schema';
import uniqWith from 'lodash/fp/uniqWith';
import isEqual from 'lodash/fp/isEqual';
import groupBy from 'lodash/fp/groupBy';
import cloneDeep from 'lodash/fp/cloneDeep';
import pickBy from 'lodash/fp/pickBy';
import mapValues from 'lodash/fp/mapValues';

export type BatchValidationResult = {
  validProducts: BatchProduct[];
  errors: BatchProductError[];
  isBatchValid: boolean;
};

export const validateBatch = (products: BatchProduct[]): BatchValidationResult => {
  const validationResult: BatchValidationResult = {
    validProducts: [],
    errors: [],
    isBatchValid: true,
  };

  // add check against unique and non null productKey and variantKey entries across entire batch
  const [nonNullProducts, batchProductNullErrors] = filterNonNullKeyProductsAndErrors(products);
  validationResult.errors.push(...batchProductNullErrors);
  const [uniqueProducts, batchProductUniqueErrors] = filterUniqueProductsAndErrors(nonNullProducts);
  validationResult.errors.push(...batchProductUniqueErrors);

  for (const product of uniqueProducts) {
    const productValidationResult = validateBatchProduct(product);
    if (!productValidationResult.isValid) {
      validationResult.errors.push({
        ...productValidationResult.error,
        refId: product.refId,
      });
      continue;
    }

    validationResult.validProducts.push(product);
  }

  validationResult.isBatchValid = isBatchValid(products, validationResult);

  return validationResult;
};

const filterNonNullKeyProductsAndErrors = (batchProducts: BatchProduct[]): [BatchProduct[], BatchProductError[]] => {
  const products = cloneDeep(batchProducts);
  const errors: BatchProductError[] = [];

  const nonNullKeyProducts = products.filter((product) => {
    if (!product.productKey) {
      errors.push({
        productKey: product.productKey,
        refId: product.refId,
        reason: 'missing a productKey',
      });
      return false;
    }

    const variantErrors: BatchProductVariantError[] = [];
    for (const variant of product.variants) {
      if (!variant.variantKey) {
        variantErrors.push({
          variantKey: variant.variantKey,
          refId: variant.refId,
          reason: 'missing a variantKey',
        });
      }
    }

    if (variantErrors.length) {
      errors.push({
        productKey: product.productKey,
        refId: product.refId,
        reason: 'has variants with missing variantKey',
        variants: variantErrors,
      });
      return false;
    }

    return true;
  });

  return [nonNullKeyProducts, errors];
};

const filterUniqueProductsAndErrors = (batchProducts: BatchProduct[]): [BatchProduct[], BatchProductError[]] => {
  const products = cloneDeep(batchProducts);
  const errors: BatchProductError[] = [];

  const groupedProducts: Record<string, BatchProduct[]> = groupBy('productKey', products);

  const duplicateProductsGroup: Record<string, BatchProduct[]> = pickBy(
    (value, key) => value.length > 1,
    groupedProducts,
  );

  // add error logs for duplicate productKeys and remove the product from further processing
  for (const [key, duplicateProducts] of Object.entries(duplicateProductsGroup)) {
    for (const duplicateProduct of duplicateProducts) {
      errors.push({
        productKey: duplicateProduct.productKey,
        refId: duplicateProduct.refId,
        reason: 'batch contains duplicates of this productKey',
      });
    }

    delete groupedProducts[key];
  }

  const groupedVariants: Record<string, { variantRefId: string; product: BatchProduct }[]> = {};
  // get the first product of the groupedProducts entries since we know they are all unique now
  Object.values(groupedProducts)
    .map((groupedProduct) => groupedProduct[0])
    .forEach((product) => {
      product.variants.forEach((variant) => {
        if (variant.variantKey in groupedVariants) {
          groupedVariants[variant.variantKey].push({ variantRefId: variant.refId.toString(), product });
        } else {
          groupedVariants[variant.variantKey] = [{ variantRefId: variant.refId.toString(), product }];
        }
      });
    });

  const duplicateVariantsProductsGroup: Record<string, { variantRefId: string; product: BatchProduct }[]> = pickBy(
    (value, key) => value.length > 1,
    groupedVariants,
  );

  // add error logs for duplicate variantKeys and remove the product from further processing
  const productVariantKeyPairErrors: Record<string, BatchProductError> = {};
  for (const [key, duplicateVariantsProducts] of Object.entries(duplicateVariantsProductsGroup)) {
    for (const { variantRefId, product } of duplicateVariantsProducts) {
      const duplicateVariant = product.variants.find(
        (variant) => variant.variantKey === key && variant.refId.toString() === variantRefId,
      );
      productVariantKeyPairErrors[product.productKey] = {
        productKey: product.productKey,
        refId: product.refId,
        reason: 'Product contains variants with duplicate variantKey values',
        variants: [
          ...(productVariantKeyPairErrors[product.productKey]?.variants || []),
          {
            variantKey: duplicateVariant.variantKey,
            refId: duplicateVariant.refId,
            reason: 'batch contains duplicates of this variantKey',
          },
        ],
      };

      delete groupedProducts[product.productKey];
    }
  }

  errors.push(...Object.values(productVariantKeyPairErrors));

  return [Object.values(groupedProducts).map((groupedProduct) => groupedProduct[0]), errors];
};

const validateBatchProduct = (product: BatchProduct): { isValid: boolean; error?: BatchProductError } => {
  const productValidationResult: { isValid: boolean; error?: BatchProductError } = {
    isValid: true,
    error: {
      productKey: product.productKey,
      reason: '',
      variants: [],
    },
  };
  const productErrors: string[] = [];

  if (!product.productKey) {
    productErrors.push('Missing productKey');
  }

  const hasDuplicateOptions = product.options ? new Set(product.options).size !== product.options.length : false;
  if (hasDuplicateOptions) {
    productErrors.push('Product has duplicate options');
  }

  const hasDuplicateVariantKey =
    new Set(product.variants.map((variant) => variant.variantKey)).size !== product.variants.length;
  if (hasDuplicateVariantKey) {
    productErrors.push('Product contains variants with duplicate variantKey');
  }

  const variantOptions =
    product.variants?.map((variant) => mapValues((value) => value.toLowerCase(), variant.options)) || [];
  const hasDuplicateVariantOptionEntries = uniqWith(isEqual, variantOptions).length !== variantOptions.length;
  if (hasDuplicateVariantOptionEntries) {
    productErrors.push('Product contains variants with duplicate options');
  }

  for (const variant of product?.variants) {
    const variantErrors: string[] = [];

    if (!variant.variantKey) {
      variantErrors.push('Missing variantKey');
    }

    if (variantErrors.length) {
      productValidationResult.error.variants.push({
        variantKey: variant.variantKey,
        reason: variantErrors.join('; '),
      });
    }
  }

  const hasErrors = productErrors.length || productValidationResult.error.variants.length;
  if (hasErrors) {
    productValidationResult.isValid = false;
    productValidationResult.error.reason = productErrors.join('; ');
  }

  return productValidationResult;
};

export const isBatchValid = (products: BatchProduct[], validationResult: BatchValidationResult) => {
  const validProductsRatio = validationResult.validProducts.length / products.length;
  const validProductsPercentage = validProductsRatio * 100;
  return validProductsPercentage >= 60;
};
