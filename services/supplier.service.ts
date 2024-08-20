import { Injectable } from '@nestjs/common';
import { GetSupplierParams } from './supplier.service.types';
import { PrismaService } from './prisma.service';
import { Prisma } from 'commons-ephesus/generated/client';
import { CortinaTokenService } from 'commons-ephesus/services/cortinaToken.service';
import CortinaClientSyncService from 'commons-ephesus/services/cortinaClientSync.service';
import CortinaClientService from 'commons-ephesus/services/cortinaClient.service';
import config from '../../config';

const tokenService = new CortinaTokenService(config.SERVICE_SECRET_KEY);
const clientService = new CortinaClientService(tokenService, {
  baseUrl: config.CLIENT_SERVICE_BASE_URL,
  baseHeaders: {
    'Content-Type': 'application/json',
  },
});
const cortinaClientSyncService = new CortinaClientSyncService(clientService);

export type SupplierType = Omit<Prisma.VendorMaxAggregateOutputType, 'config' | 'auth'> & {
  config: Record<string, any>;
  auth: Record<string, any>;
};

export type SupplierJwt = {
  id: string;
};

@Injectable()
export class SupplierService {
  constructor(private prisma: PrismaService) {}

  static getRequiredRelations(): Prisma.VendorWhereInput {
    return {
      Brands: {
        some: {
          BillingSettings: {
            some: {},
          },
        },
      },
      VendorAddresses: {
        some: {},
      },
      Contacts: {
        some: {},
      },
    };
  }

  static getSupplierInclude(): {
    Brands: true;
    VendorAddresses: {
      distinct: ['vendorId'];
    };
    Contacts: true;
  } {
    return {
      Brands: true,
      VendorAddresses: {
        distinct: ['vendorId'],
      },
      Contacts: true,
    };
  }

  async getSupplier(params: GetSupplierParams): Promise<SupplierType> {
    if (!params.id && !params.name) {
      return null;
    }

    const vendor: Prisma.VendorMaxAggregateOutputType = await this.prisma.vendor.findFirst({
      where: {
        ...SupplierService.getRequiredRelations(),
        ...params,
      },
      include: SupplierService.getSupplierInclude(),
    });

    if (!vendor) {
      return null;
    }

    return {
      ...vendor,
      config: JSON.parse(vendor.config),
      auth: JSON.parse(vendor.auth),
    };
  }

  async getSupplierById(supplierId: string): Promise<SupplierType> {
    const vendor: Prisma.VendorMaxAggregateOutputType = await this.prisma.vendor.findFirst({
      where: {
        id: supplierId,
      },
    });

    if (!vendor) {
      return null;
    }

    return {
      ...vendor,
      config: JSON.parse(vendor.config),
      auth: JSON.parse(vendor.auth),
    };
  }

  async getSuppliers(params: Prisma.VendorWhereInput) {
    const suppliers = await this.prisma.vendor.findMany({
      where: params,
    });

    return suppliers.map((supplier) => ({
      ...supplier,
      config: JSON.parse(supplier.config),
      auth: JSON.parse(supplier.auth),
    }));
  }

  async updateSupplier(supplierId: string, data: Prisma.VendorUpdateInput) {
    const vendorUpdate = await this.prisma.vendor.update({
      data,
      where: {
        id: supplierId,
      },
    });

    await cortinaClientSyncService.syncVendorToClientService(supplierId);

    return vendorUpdate;
  }
}
