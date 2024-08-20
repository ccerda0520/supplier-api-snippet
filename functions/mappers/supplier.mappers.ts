import { z } from 'zod';
import { Supplier } from 'commons-ephesus/schemas/supplier-api/supplier.schema';

export type SupplierType = z.infer<typeof Supplier>;
