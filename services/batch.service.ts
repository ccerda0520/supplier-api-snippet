import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { Prisma } from 'commons-ephesus/generated/client';
import { BatchQuery } from 'commons-ephesus/schemas/batch.schema';

@Injectable()
export class BatchService {
  constructor(private prisma: PrismaService) {}

  async createBatch(batch: Prisma.BatchUncheckedCreateInput) {
    return this.prisma.batch.create({
      data: batch,
    });
  }

  async getBatch(id: string, supplierId: string) {
    return this.prisma.batch.findFirst({
      where: {
        id,
        vendorId: supplierId,
      },
    });
  }

  async getBatchById(id: string) {
    return this.prisma.batch.findFirst({
      where: {
        id,
      },
      include: {
        Vendor: true,
      },
    });
  }

  async getBatches({ page_index = 0, page_size = 250, ...params }: BatchQuery, supplierId: string) {
    const where: Prisma.BatchWhereInput = {
      type: 'SUPPLIED_PRODUCT',
      vendorId: supplierId,
    };

    if (params.batch_name) {
      where.name = {
        contains: params.batch_name,
        mode: 'insensitive',
      };
    }

    if (params.status) {
      where.status = params.status;
    }

    if (params.batch_run_earliest) {
      where.runDate = {
        gte: params.batch_run_earliest,
      };
    }

    if (params.batch_run_latest) {
      where.runDate = {
        ...((where.runDate as Prisma.DateTimeNullableFilter) || {}),
        lte: params.batch_run_latest,
      };
    }

    const [batches, totalCount] = await this.prisma.$transaction([
      this.prisma.batch.findMany({
        where,
        skip: page_size * page_index,
        take: page_size,
      }),
      this.prisma.batch.count({
        where,
      }),
    ]);

    return {
      count: totalCount,
      rows: batches,
    };
  }

  async getAllPendingSuppliedProductBatches() {
    return this.prisma.batch.findMany({
      where: {
        status: 'PENDING',
        type: 'SUPPLIED_PRODUCT',
      },
      include: {
        Vendor: true,
      },
    });
  }

  async updateBatch(id: string, batch: Prisma.BatchUncheckedUpdateInput) {
    return this.prisma.batch.update({
      where: {
        id: id,
      },
      data: batch,
    });
  }

  async isLatestBatch(date: Date, supplierId: string) {
    const newerBatch = await this.prisma.batch.findFirst({
      where: {
        date: {
          gt: date,
        },
        vendorId: supplierId,
        status: 'SUCCESS',
      },
    });

    return !newerBatch;
  }
}
