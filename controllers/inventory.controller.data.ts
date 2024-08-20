import { AdjustmentItem } from 'commons-ephesus/schemas/supplier-api/inventory.schema';
import { mockSuppliedProductVariant, mockSuppliedProductVariant2 } from '../constants/test.constants';

export const mockAdjustmentItem = {
  sku: mockSuppliedProductVariant.sku,
  quantity: 12,
  unlimited: false,
  currency: 'USD',
  price: {
    amount: '4.99',
  },
  compareToPrice: {
    amount: 2.99,
  },
  wholesalePrice: {
    amount: '.99',
  },
};

export const mockAdjustmentItems: AdjustmentItem[] = [
  mockAdjustmentItem as unknown as AdjustmentItem,
  {
    ...mockAdjustmentItem,
    sku: mockSuppliedProductVariant2.sku,
  } as unknown as AdjustmentItem,
];
