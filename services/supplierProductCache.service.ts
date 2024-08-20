import { Injectable } from '@nestjs/common';
import fetch from 'cross-fetch';
import config from '../../config';
import jsonwebtoken from 'jsonwebtoken';

/**
 * TODO: Replace with commons service
 */
@Injectable()
export class SupplierProductCacheService {
  async getProductsBySupplierCode(supplierCode: string) {
    const products = [];
    const productsUrl = new URL(`${config.SUPPLIER_PRODUCT_SERVICE_BASE_URL}/supplier-cache/${supplierCode}/products`);
    const productsResponse = await fetch(productsUrl, {
      headers: this.getHeaders(),
    });
    const productsData = await productsResponse.json();
    products.push(...(productsData?.body?.products || []));

    return products;
  }

  async getSupplierBySupplierCode(supplierCode: string) {
    const supplierUrl = new URL(`${config.SUPPLIER_PRODUCT_SERVICE_BASE_URL}/supplier/${supplierCode}`);
    const supplierResponse = await fetch(supplierUrl, {
      headers: this.getHeaders(),
    });

    const supplierData = await supplierResponse.json();
    return supplierData?.body;
  }

  private getHeaders() {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.getToken()}`,
    };
  }

  private getToken() {
    const options: jsonwebtoken.SignOptions = {
      expiresIn: 3600,
    };

    return jsonwebtoken.sign(
      {
        tokenCreatedAt: new Date().toISOString(),
      },
      config.SERVICE_SECRET_KEY,
      options,
    );
  }
}
