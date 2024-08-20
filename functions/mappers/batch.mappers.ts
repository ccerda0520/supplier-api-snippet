import { Prisma } from 'commons-ephesus/generated/client';
import { BatchResult, BatchUpsertBody } from 'commons-ephesus/schemas/batch.schema';
import { SupplierType } from '../../services/supplier.service';

export const fromBatchDbToApi = (batch: Prisma.BatchCreateInput): BatchResult => {
  const batchResult = batch?.result as Record<string, any>;

  return {
    id: batch.id,
    batchName: batch.name,
    batchDate: batch.date as Date,
    customData: batchResult?.customdata || {},
    batchRunDate: batch.runDate as Date,
    status: batch.status,
    productsImportedCount: batchResult?.productsImported?.length ?? null,
    productsNotImportedCount: batchResult?.productsNotImported?.length ?? null,
    productsImported: batchResult?.productsImported || [],
    productsNotImported: batchResult?.productsNotImported || [],
  };
};

export const fromBatchBodyToBatchDb = (
  { batch, products }: BatchUpsertBody,
  supplier: SupplierType,
): Prisma.BatchGroupByOutputType => {
  return {
    id: '',
    runDate: null,
    type: 'SUPPLIED_PRODUCT',
    status: 'PENDING',
    content: {
      batch: batch,
      products: products,
    } as Record<string, any>,
    result: null,
    createdAt: null,
    updatedAt: null,
    _count: null,
    _max: null,
    _min: null,
    vendorId: supplier.id,
    name: batch.batchName,
    date: batch.batchDate,
  };
};
