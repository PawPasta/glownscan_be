import { Inject, Injectable } from '@nestjs/common';
import { AuditLogService } from '../../../audit/application/use-case/audit-log.service.js';
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
    private readonly auditLog: AuditLogService,
  ) {}

  listIngredients(options: CatalogListOptions) {
    return this.run(this.catalog.listIngredients(options));
  }
  listSkinConcerns(options: CatalogListOptions) {
    return this.run(this.catalog.listSkinConcerns(options));
  }
  async createIngredient(actorId: string, input: Record<string, unknown>) {
    const result = await this.run(this.catalog.createIngredient(input));
    await this.recordMutation(actorId, 'CATALOG_INGREDIENT_CREATED', result);
    return result;
  }
  async updateIngredient(
    actorId: string,
    id: string,
    input: Record<string, unknown>,
  ) {
    const result = await this.run(this.catalog.updateIngredient(id, input));
    await this.recordMutation(
      actorId,
      'CATALOG_INGREDIENT_UPDATED',
      result,
      id,
    );
    return result;
  }
  async deleteIngredient(actorId: string, id: string) {
    const result = await this.run(this.catalog.deleteIngredient(id));
    await this.recordMutation(
      actorId,
      'CATALOG_INGREDIENT_DEACTIVATED',
      result,
      id,
    );
    return result;
  }
  async createSkinConcern(actorId: string, input: Record<string, unknown>) {
    const result = await this.run(this.catalog.createSkinConcern(input));
    await this.recordMutation(actorId, 'CATALOG_SKIN_CONCERN_CREATED', result);
    return result;
  }
  async updateSkinConcern(
    actorId: string,
    id: string,
    input: Record<string, unknown>,
  ) {
    const result = await this.run(this.catalog.updateSkinConcern(id, input));
    await this.recordMutation(
      actorId,
      'CATALOG_SKIN_CONCERN_UPDATED',
      result,
      id,
    );
    return result;
  }
  async deleteSkinConcern(actorId: string, id: string) {
    const result = await this.run(this.catalog.deleteSkinConcern(id));
    await this.recordMutation(
      actorId,
      'CATALOG_SKIN_CONCERN_DEACTIVATED',
      result,
      id,
    );
    return result;
  }
  listProducts(options: CatalogListOptions) {
    return this.run(this.catalog.listProducts(options));
  }
  getProduct(id: string, activeOnly: boolean) {
    return this.run(this.catalog.getProduct(id, activeOnly));
  }
  async createProduct(actorId: string, input: CatalogProductInput) {
    const result = await this.run(this.catalog.createProduct(input));
    await this.recordMutation(actorId, 'CATALOG_PRODUCT_CREATED', result);
    return result;
  }
  async updateProduct(actorId: string, id: string, input: CatalogProductInput) {
    const result = await this.run(this.catalog.updateProduct(id, input));
    await this.recordMutation(actorId, 'CATALOG_PRODUCT_UPDATED', result, id);
    return result;
  }
  async deleteProduct(actorId: string, id: string) {
    const result = await this.run(this.catalog.deleteProduct(id));
    await this.recordMutation(
      actorId,
      'CATALOG_PRODUCT_DEACTIVATED',
      result,
      id,
    );
    return result;
  }
  listAffiliateLinks(productId: string, activeOnly: boolean) {
    return this.run(this.catalog.listAffiliateLinks(productId, activeOnly));
  }
  async createAffiliateLink(
    actorId: string,
    productId: string,
    input: Record<string, unknown>,
  ) {
    const result = await this.run(
      this.catalog.createAffiliateLink(productId, input),
    );
    await this.recordMutation(
      actorId,
      'CATALOG_AFFILIATE_LINK_CREATED',
      result,
    );
    return result;
  }
  async updateAffiliateLink(
    actorId: string,
    id: string,
    input: Record<string, unknown>,
  ) {
    const result = await this.run(this.catalog.updateAffiliateLink(id, input));
    await this.recordMutation(
      actorId,
      'CATALOG_AFFILIATE_LINK_UPDATED',
      result,
      id,
    );
    return result;
  }
  async deleteAffiliateLink(actorId: string, id: string) {
    const result = await this.run(this.catalog.deleteAffiliateLink(id));
    await this.recordMutation(
      actorId,
      'CATALOG_AFFILIATE_LINK_DEACTIVATED',
      result,
      id,
    );
    return result;
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

  private recordMutation(
    actorId: string,
    action: string,
    result: unknown,
    fallbackId?: string,
  ) {
    const resourceId =
      typeof result === 'object' && result !== null && 'id' in result
        ? String(result.id)
        : fallbackId;
    if (!resourceId)
      throw new Error('Catalog mutation returned no resource ID.');
    const resourceType = action.includes('INGREDIENT')
      ? 'CATALOG_INGREDIENT'
      : action.includes('SKIN_CONCERN')
        ? 'CATALOG_SKIN_CONCERN'
        : action.includes('AFFILIATE_LINK')
          ? 'CATALOG_AFFILIATE_LINK'
          : 'CATALOG_PRODUCT';
    return this.auditLog.record({
      actorUserId: actorId,
      action,
      resourceType,
      resourceId,
    });
  }
}
