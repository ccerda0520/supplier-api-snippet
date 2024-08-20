import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../services/prisma.service';
import { SupplierService, SupplierType } from '../services/supplier.service';
import { mockDeep } from 'jest-mock-extended';
import { PrismaClient } from 'commons-ephesus/generated/client';
import { InventoryController } from './inventory.controller';
import { InventoryAdjustmentService } from '../services/inventory/inventoryAdjustment.service';
import { mockAdjustmentItems } from './inventory.controller.data';
import {
  mockSuppliedProductVariant,
  mockSuppliedProductVariant2,
  mockSupplier,
  SUPPLIER_ID,
  SUPPLIER_TOKEN,
} from '../constants/test.constants';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

describe('InventoryController', () => {
  let supplierService: SupplierService;
  let jwtService: JwtService;
  let prisma: PrismaService;
  let app: INestApplication;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InventoryController],
      providers: [JwtService, PrismaService, SupplierService, InventoryController, InventoryAdjustmentService],
    })
      .overrideProvider(PrismaService)
      .useValue(mockDeep<PrismaClient>())
      .compile();

    supplierService = module.get<SupplierService>(SupplierService);
    prisma = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
    app = module.createNestApplication();
    await app.init();

    jest.spyOn(jwtService, 'verifyAsync').mockImplementation(async (payload: string) => {
      return { id: SUPPLIER_ID };
    });

    jest.spyOn(supplierService, 'getSupplierById').mockImplementation(async (id: string) => {
      if (id === SUPPLIER_ID) {
        return mockSupplier as unknown as SupplierType;
      }
      return null;
    });

    // @ts-ignore the findMany function type is really hard to get completely right
    jest.spyOn(prisma.suppliedProductVariant, 'findMany').mockImplementation(async ({ where: { OR } }) => {
      for (const condition of OR) {
        const queryKey = Object.keys(condition)[0];
        if (condition[queryKey] === mockSuppliedProductVariant[queryKey]) {
          return [mockSuppliedProductVariant];
        }
        if (condition[queryKey] === mockSuppliedProductVariant2[queryKey]) {
          return [mockSuppliedProductVariant2];
        }
      }

      return [];
    });

    jest.spyOn(prisma.productVariant, 'findMany').mockResolvedValue([]);
  });

  describe('Adjustment', () => {
    it('should be successful, variant update using sku', async () => {
      return request(app.getHttpServer())
        .post('/inventory/adjustment')
        .send([mockAdjustmentItems[0]])
        .set('Accept', 'application/json')
        .set('Authorization', `Bearer ${SUPPLIER_TOKEN}`)
        .expect(204);
    });

    it('should be successful, variant update using variantKey', async () => {
      const adjustmentItem = {
        ...mockAdjustmentItems[0],
        variantKey: mockAdjustmentItems[0].sku,
      };

      delete adjustmentItem.sku;

      return request(app.getHttpServer())
        .post('/inventory/adjustment')
        .send([adjustmentItem])
        .set('Accept', 'application/json')
        .set('Authorization', `Bearer ${SUPPLIER_TOKEN}`)
        .expect(204);
    });

    it('should be successful, only updating quantity', async () => {
      const adjustmentItem = {
        sku: mockAdjustmentItems[0].sku,
        quantity: mockAdjustmentItems[0].quantity,
      };

      return request(app.getHttpServer())
        .post('/inventory/adjustment')
        .send([adjustmentItem])
        .set('Accept', 'application/json')
        .set('Authorization', `Bearer ${SUPPLIER_TOKEN}`)
        .expect(204);
    });

    it('should fail, variant with sku not found', async () => {
      return request(app.getHttpServer())
        .post('/inventory/adjustment')
        .send([
          {
            ...mockAdjustmentItems[0],
            sku: 'non matched sku',
          },
        ])
        .set('Accept', 'application/json')
        .set('Authorization', `Bearer ${SUPPLIER_TOKEN}`)
        .expect('Content-Type', /json/)
        .expect(422);
    });

    it('should fail, variant with variantKey not found', async () => {
      const adjustmentItem = {
        ...mockAdjustmentItems[0],
        variantKey: 'non matched variantKey',
      };

      delete adjustmentItem.sku;

      return request(app.getHttpServer())
        .post('/inventory/adjustment')
        .send([adjustmentItem])
        .set('Accept', 'application/json')
        .set('Authorization', `Bearer ${SUPPLIER_TOKEN}`)
        .expect('Content-Type', /json/)
        .expect(422);
    });

    it('should fail, 2 variant with one not found', async () => {
      return request(app.getHttpServer())
        .post('/inventory/adjustment')
        .send([
          mockAdjustmentItems[0],
          {
            ...mockAdjustmentItems[1],
            sku: 'not found sku',
          },
        ])
        .set('Accept', 'application/json')
        .set('Authorization', `Bearer ${SUPPLIER_TOKEN}`)
        .expect('Content-Type', /json/)
        .expect(422);
    });

    it('should fail, has both sku and variant key', async () => {
      return request(app.getHttpServer())
        .post('/inventory/adjustment')
        .send([
          {
            ...mockAdjustmentItems[0],
            variantKey: mockAdjustmentItems[0].sku,
          },
        ])
        .set('Accept', 'application/json')
        .set('Authorization', `Bearer ${SUPPLIER_TOKEN}`)
        .expect('Content-Type', /json/)
        .expect(400);
    });

    it('should fail, empty body array', async () => {
      return request(app.getHttpServer())
        .post('/inventory/adjustment')
        .send([])
        .set('Accept', 'application/json')
        .set('Authorization', `Bearer ${SUPPLIER_TOKEN}`)
        .expect('Content-Type', /json/)
        .expect(400);
    });

    it('should fail, variant has invalid price', async () => {
      return request(app.getHttpServer())
        .post('/inventory/adjustment')
        .send([
          {
            ...mockAdjustmentItems[0],
            price: {
              amount: 'asdfsadf',
            } as unknown as any,
          },
        ])
        .set('Accept', 'application/json')
        .set('Authorization', `Bearer ${SUPPLIER_TOKEN}`)
        .expect('Content-Type', /json/)
        .expect(400);
    });

    it('should fail, variant has invalid compare price', async () => {
      return request(app.getHttpServer())
        .post('/inventory/adjustment')
        .send([
          {
            ...mockAdjustmentItems[0],
            compareToPrice: {
              amount: 'asdfsadf',
            } as unknown as any,
          },
        ])
        .set('Accept', 'application/json')
        .set('Authorization', `Bearer ${SUPPLIER_TOKEN}`)
        .expect('Content-Type', /json/)
        .expect(400);
    });

    it('should fail, variant has invalid wholesale price', async () => {
      return request(app.getHttpServer())
        .post('/inventory/adjustment')
        .send([
          {
            ...mockAdjustmentItems[0],
            wholesalePrice: {
              amount: 'asdfsadf',
            } as unknown as any,
          },
        ])
        .set('Accept', 'application/json')
        .set('Authorization', `Bearer ${SUPPLIER_TOKEN}`)
        .expect('Content-Type', /json/)
        .expect(400);
    });

    it('should be successful, variant sku lookup using generatedSku', async () => {
      return request(app.getHttpServer())
        .post('/inventory/adjustment')
        .send([
          {
            ...mockAdjustmentItems[0],
            sku: mockSuppliedProductVariant.generatedSku,
          },
        ])
        .set('Accept', 'application/json')
        .set('Authorization', `Bearer ${SUPPLIER_TOKEN}`)
        .expect(204);
    });

    it('should fail, duplicate variant references in body', async () => {
      return request(app.getHttpServer())
        .post('/inventory/adjustment')
        .send([mockAdjustmentItems[0], mockAdjustmentItems[0]])
        .set('Accept', 'application/json')
        .set('Authorization', `Bearer ${SUPPLIER_TOKEN}`)
        .expect('Content-Type', /json/)
        .expect(400);
    });

    it('should fail, more than 1 variantKey matches throws an error', async () => {
      // @ts-ignore the findMany function type is really hard to get completely right
      jest.spyOn(prisma.suppliedProductVariant, 'findMany').mockImplementation(async ({ where: { OR } }) => {
        return [mockSuppliedProductVariant, mockSuppliedProductVariant];
      });
      return request(app.getHttpServer())
        .post('/inventory/adjustment')
        .send([mockAdjustmentItems[0]])
        .set('Accept', 'application/json')
        .set('Authorization', `Bearer ${SUPPLIER_TOKEN}`)
        .expect('Content-Type', /json/)
        .expect(422);
    });
  });
});
