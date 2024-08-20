import { BatchProductVariant } from 'commons-ephesus/schemas/supplier-api/product.schema';

export const IsNotSameCurrency = (batchVariant: BatchProductVariant, supplierCurrency: string) => {
  return (
    (batchVariant.price?.currency && supplierCurrency.toLowerCase() !== batchVariant.price?.currency.toLowerCase()) ||
    (batchVariant.wholesalePrice?.currency &&
      supplierCurrency.toLowerCase() !== batchVariant.wholesalePrice?.currency.toLowerCase()) ||
    (batchVariant.compareToPrice?.currency &&
      supplierCurrency.toLowerCase() !== batchVariant.compareToPrice?.currency.toLowerCase())
  );
};
