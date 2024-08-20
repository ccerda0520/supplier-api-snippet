export type VariantStatusUpdateItem = { isEnabledProducts: boolean; productId: string; itemId: string; qty: number };

export type ProductImageSyncItem = { variantImageMap: Record<string, any>; productId: string; images: string };
