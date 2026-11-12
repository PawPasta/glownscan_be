import { Inject, Injectable } from '@nestjs/common';
import { NotFoundException } from '../../../../shared/handler/http.exceptions.js';
import {
  CATALOG_DATA_PORT,
  type CatalogDataPort,
  type CatalogListOptions,
  type CatalogProductInput,
} from '../ports/catalog-data.port.js';

@Injectable()
export class CatalogService {
  constructor(
    @Inject(CATALOG_DATA_PORT) private readonly catalog: CatalogDataPort,
  ) {}

  listIngredients(options: CatalogListOptions) {
    return this.run(this.catalog.listIngredients(options));
  }
  listSkinConcerns(options: CatalogListOptions) {
    return this.run(this.catalog.listSkinConcerns(options));
  }
  createIngredient(input: Record<string, unknown>) {
    return this.run(this.catalog.createIngredient(input));
  }
  updateIngredient(id: string, input: Record<string, unknown>) {
    return this.run(this.catalog.updateIngredient(id, input));
  }
  deleteIngredient(id: string) {
    return this.run(this.catalog.deleteIngredient(id));
  }
  createSkinConcern(input: Record<string, unknown>) {
    return this.run(this.catalog.createSkinConcern(input));
  }
  updateSkinConcern(id: string, input: Record<string, unknown>) {
    return this.run(this.catalog.updateSkinConcern(id, input));
  }
  deleteSkinConcern(id: string) {
    return this.run(this.catalog.deleteSkinConcern(id));
  }
  listProducts(options: CatalogListOptions) {
    return this.run(this.catalog.listProducts(options));
  }
  getProduct(id: string, activeOnly: boolean) {
    return this.run(this.catalog.getProduct(id, activeOnly));
  }
  createProduct(input: CatalogProductInput) {
    return this.run(this.catalog.createProduct(input));
  }
  updateProduct(id: string, input: CatalogProductInput) {
    return this.run(this.catalog.updateProduct(id, input));
  }
  deleteProduct(id: string) {
    return this.run(this.catalog.deleteProduct(id));
  }
  listAffiliateLinks(productId: string, activeOnly: boolean) {
    return this.run(this.catalog.listAffiliateLinks(productId, activeOnly));
  }
  createAffiliateLink(productId: string, input: Record<string, unknown>) {
    return this.run(this.catalog.createAffiliateLink(productId, input));
  }
  updateAffiliateLink(id: string, input: Record<string, unknown>) {
    return this.run(this.catalog.updateAffiliateLink(id, input));
  }
  deleteAffiliateLink(id: string) {
    return this.run(this.catalog.deleteAffiliateLink(id));
  }

  private async run<T>(operation: Promise<T>): Promise<T> {
    try {
      return await operation;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'PRODUCT_NOT_FOUND')
          throw new NotFoundException('Product not found.');
        if (error.message === 'AFFILIATE_LINK_NOT_FOUND')
          throw new NotFoundException('Affiliate link not found.');
        if (error.message === 'CATALOG_RECORD_NOT_FOUND')
          throw new NotFoundException('Catalog record not found.');
      }
      throw error;
    }
  }
}
