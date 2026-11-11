import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../../shared/database/database.service.js';
import { NotFoundException } from '../../../shared/handler/http.exceptions.js';

type ListOptions = {
  page: number;
  limit: number;
  search?: string;
  activeOnly: boolean;
};
type ProductInput = {
  name?: string;
  brand?: string;
  description?: string;
  imageUrl?: string;
  isActive?: boolean;
  ingredientIds?: string[];
  skinConcernIds?: string[];
};

@Injectable()
export class CatalogService {
  constructor(private readonly database: DatabaseService) {}

  async listIngredients(options: ListOptions) {
    return this.listSimple('ingredients', options);
  }

  async listSkinConcerns(options: ListOptions) {
    return this.listSimple('skin_concerns', options);
  }

  async createIngredient(input: Record<string, unknown>) {
    return this.createSimple('ingredients', input);
  }

  async updateIngredient(id: string, input: Record<string, unknown>) {
    return this.updateSimple('ingredients', id, input);
  }

  async deleteIngredient(id: string) {
    return this.deactivate('ingredients', id);
  }

  async createSkinConcern(input: Record<string, unknown>) {
    return this.createSimple('skin_concerns', input);
  }

  async updateSkinConcern(id: string, input: Record<string, unknown>) {
    return this.updateSimple('skin_concerns', id, input);
  }

  async deleteSkinConcern(id: string) {
    return this.deactivate('skin_concerns', id);
  }

  async listProducts(options: ListOptions) {
    const offset = (options.page - 1) * options.limit;
    const conditions = options.activeOnly ? ['p.is_active'] : [];
    const values: unknown[] = [];
    if (options.search?.trim()) {
      values.push(`%${options.search.trim()}%`);
      conditions.push(
        `(p.name ILIKE $${values.length} OR p.brand ILIKE $${values.length})`,
      );
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    values.push(options.limit, offset);
    const result = await this.database.query(
      `SELECT p.id, p.name, p.brand, p.description, p.image_url AS "imageUrl",
              p.is_active AS "isActive", p.created_at AS "createdAt", p.updated_at AS "updatedAt",
              COUNT(*) OVER() AS "total"
       FROM app_catalog.products p ${where}
       ORDER BY p.created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return this.page(result.rows, options);
  }

  async getProduct(id: string, activeOnly: boolean) {
    const result = await this.database.query(
      `SELECT p.id, p.name, p.brand, p.description, p.image_url AS "imageUrl",
              p.is_active AS "isActive", p.created_at AS "createdAt", p.updated_at AS "updatedAt",
              COALESCE((SELECT json_agg(json_build_object('id', i.id, 'name', i.name) ORDER BY i.name)
                FROM app_catalog.product_ingredients pi JOIN app_catalog.ingredients i ON i.id = pi.ingredient_id
                WHERE pi.product_id = p.id ${activeOnly ? 'AND i.is_active' : ''}), '[]'::json) AS ingredients,
              COALESCE((SELECT json_agg(json_build_object('id', c.id, 'code', c.code, 'name', c.name) ORDER BY c.name)
                FROM app_catalog.product_skin_concerns pc JOIN app_catalog.skin_concerns c ON c.id = pc.skin_concern_id
                WHERE pc.product_id = p.id ${activeOnly ? 'AND c.is_active' : ''}), '[]'::json) AS "skinConcerns"
       FROM app_catalog.products p WHERE p.id = $1 ${activeOnly ? 'AND p.is_active' : ''}`,
      [id],
    );
    if (!result.rows[0]) throw new NotFoundException('Product not found.');
    return result.rows[0];
  }

  async createProduct(input: ProductInput) {
    const id = await this.database.transaction(async (client) => {
      const result = await client.query<{ id: string }>(
        `INSERT INTO app_catalog.products (name, brand, description, image_url, is_active)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [
          input.name?.trim(),
          nullable(input.brand),
          nullable(input.description),
          nullable(input.imageUrl),
          input.isActive ?? true,
        ],
      );
      const id = result.rows[0].id;
      await this.replaceProductRelations(client, id, input);
      return id;
    });
    return this.getProduct(id, false);
  }

  async updateProduct(id: string, input: ProductInput) {
    await this.database.transaction(async (client) => {
      const assignments: string[] = [];
      const values: unknown[] = [id];
      const columns: Record<string, string> = {
        name: 'name',
        brand: 'brand',
        description: 'description',
        imageUrl: 'image_url',
        isActive: 'is_active',
      };
      for (const [key, column] of Object.entries(columns)) {
        if (Object.hasOwn(input, key)) {
          values.push(
            key === 'name'
              ? input.name?.trim()
              : input[key as keyof ProductInput],
          );
          assignments.push(`${column} = $${values.length}`);
        }
      }
      if (assignments.length) {
        const updated = await client.query(
          `UPDATE app_catalog.products SET ${assignments.join(', ')} WHERE id = $1`,
          values,
        );
        if (!updated.rowCount)
          throw new NotFoundException('Product not found.');
      } else {
        await this.assertProductExists(client, id);
      }
      await this.replaceProductRelations(client, id, input);
    });
    return this.getProduct(id, false);
  }

  async deleteProduct(id: string) {
    return this.deactivate('products', id);
  }

  async listAffiliateLinks(productId: string, activeOnly: boolean) {
    await this.getProduct(productId, activeOnly);
    const result = await this.database.query(
      `SELECT id, product_id AS "productId", partner_name AS "partnerName", url,
              is_active AS "isActive", created_at AS "createdAt", updated_at AS "updatedAt"
       FROM app_catalog.affiliate_links WHERE product_id = $1 ${activeOnly ? 'AND is_active' : ''}
       ORDER BY created_at DESC`,
      [productId],
    );
    return result.rows;
  }

  async createAffiliateLink(productId: string, input: Record<string, unknown>) {
    await this.getProduct(productId, false);
    const result = await this.database.query(
      `INSERT INTO app_catalog.affiliate_links (product_id, partner_name, url, is_active)
       VALUES ($1, $2, $3, $4)
       RETURNING id, product_id AS "productId", partner_name AS "partnerName", url, is_active AS "isActive"`,
      [
        productId,
        String(input.partnerName).trim(),
        input.url,
        input.isActive ?? true,
      ],
    );
    return result.rows[0];
  }

  async updateAffiliateLink(id: string, input: Record<string, unknown>) {
    const columns: Record<string, string> = {
      partnerName: 'partner_name',
      url: 'url',
      isActive: 'is_active',
    };
    const values: unknown[] = [id];
    const assignments: string[] = [];
    for (const [key, column] of Object.entries(columns))
      if (Object.hasOwn(input, key)) {
        values.push(
          key === 'partnerName' ? String(input[key]).trim() : input[key],
        );
        assignments.push(`${column} = $${values.length}`);
      }
    if (!assignments.length) return this.getAffiliateLink(id);
    const result = await this.database.query(
      `UPDATE app_catalog.affiliate_links SET ${assignments.join(', ')} WHERE id = $1
       RETURNING id, product_id AS "productId", partner_name AS "partnerName", url, is_active AS "isActive"`,
      values,
    );
    if (!result.rows[0])
      throw new NotFoundException('Affiliate link not found.');
    return result.rows[0];
  }

  async deleteAffiliateLink(id: string) {
    return this.deactivate('affiliate_links', id);
  }

  private async listSimple(
    table: 'ingredients' | 'skin_concerns',
    options: ListOptions,
  ) {
    const offset = (options.page - 1) * options.limit;
    const conditions = options.activeOnly ? ['is_active'] : [];
    const values: unknown[] = [];
    if (options.search?.trim()) {
      values.push(`%${options.search.trim()}%`);
      conditions.push(`name ILIKE $${values.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    values.push(options.limit, offset);
    const columns =
      table === 'skin_concerns'
        ? 'id, code, name, description, is_active AS "isActive", created_at AS "createdAt", updated_at AS "updatedAt"'
        : 'id, name, description, is_active AS "isActive", created_at AS "createdAt", updated_at AS "updatedAt"';
    const result = await this.database.query(
      `SELECT ${columns}, COUNT(*) OVER() AS "total" FROM app_catalog.${table} ${where} ORDER BY name LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return this.page(result.rows, options);
  }

  private async createSimple(
    table: 'ingredients' | 'skin_concerns',
    input: Record<string, unknown>,
  ) {
    const fields =
      table === 'skin_concerns'
        ? ['code', 'name', 'description', 'is_active']
        : ['name', 'description', 'is_active'];
    const values = fields.map((field) =>
      field === 'is_active'
        ? (input.isActive ?? true)
        : field === 'code'
          ? String(input.code).trim().toUpperCase()
          : field === 'name'
            ? String(input.name).trim()
            : nullable(input.description),
    );
    const result = await this.database.query(
      `INSERT INTO app_catalog.${table} (${fields.join(', ')}) VALUES (${fields.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
      values,
    );
    return result.rows[0];
  }

  private async updateSimple(
    table: 'ingredients' | 'skin_concerns',
    id: string,
    input: Record<string, unknown>,
  ) {
    const permitted =
      table === 'skin_concerns'
        ? ['code', 'name', 'description', 'isActive']
        : ['name', 'description', 'isActive'];
    const values: unknown[] = [id];
    const assignments: string[] = [];
    for (const key of permitted)
      if (Object.hasOwn(input, key)) {
        values.push(
          key === 'code'
            ? String(input[key]).trim().toUpperCase()
            : key === 'name'
              ? String(input[key]).trim()
              : key === 'description'
                ? nullable(input[key])
                : input[key],
        );
        assignments.push(
          `${key === 'isActive' ? 'is_active' : key} = $${values.length}`,
        );
      }
    if (!assignments.length) return this.getSimple(table, id);
    const result = await this.database.query(
      `UPDATE app_catalog.${table} SET ${assignments.join(', ')} WHERE id = $1 RETURNING *`,
      values,
    );
    if (!result.rows[0])
      throw new NotFoundException('Catalog record not found.');
    return result.rows[0];
  }

  private async deactivate(
    table: 'ingredients' | 'skin_concerns' | 'products' | 'affiliate_links',
    id: string,
  ) {
    const result = await this.database.query(
      `UPDATE app_catalog.${table} SET is_active = FALSE WHERE id = $1 RETURNING id, is_active AS "isActive"`,
      [id],
    );
    if (!result.rows[0])
      throw new NotFoundException('Catalog record not found.');
    return result.rows[0];
  }

  private async getSimple(table: 'ingredients' | 'skin_concerns', id: string) {
    const result = await this.database.query(
      `SELECT * FROM app_catalog.${table} WHERE id = $1`,
      [id],
    );
    if (!result.rows[0])
      throw new NotFoundException('Catalog record not found.');
    return result.rows[0];
  }

  private async getAffiliateLink(id: string) {
    const result = await this.database.query(
      `SELECT id, product_id AS "productId", partner_name AS "partnerName", url, is_active AS "isActive" FROM app_catalog.affiliate_links WHERE id = $1`,
      [id],
    );
    if (!result.rows[0])
      throw new NotFoundException('Affiliate link not found.');
    return result.rows[0];
  }

  private async assertProductExists(client: PoolClient, id: string) {
    const found = await client.query(
      'SELECT 1 FROM app_catalog.products WHERE id = $1 FOR UPDATE',
      [id],
    );
    if (!found.rowCount) throw new NotFoundException('Product not found.');
  }

  private async replaceProductRelations(
    client: PoolClient,
    productId: string,
    input: ProductInput,
  ) {
    if (input.ingredientIds !== undefined) {
      await client.query(
        'DELETE FROM app_catalog.product_ingredients WHERE product_id = $1',
        [productId],
      );
      if (input.ingredientIds.length)
        await client.query(
          `INSERT INTO app_catalog.product_ingredients (product_id, ingredient_id) SELECT $1, unnest($2::uuid[])`,
          [productId, input.ingredientIds],
        );
    }
    if (input.skinConcernIds !== undefined) {
      await client.query(
        'DELETE FROM app_catalog.product_skin_concerns WHERE product_id = $1',
        [productId],
      );
      if (input.skinConcernIds.length)
        await client.query(
          `INSERT INTO app_catalog.product_skin_concerns (product_id, skin_concern_id) SELECT $1, unnest($2::uuid[])`,
          [productId, input.skinConcernIds],
        );
    }
  }

  private page(rows: Array<Record<string, unknown>>, options: ListOptions) {
    const total = Number(rows[0]?.total ?? 0);
    return {
      items: rows.map(({ total: _total, ...row }) => row),
      page: options.page,
      limit: options.limit,
      total,
    };
  }
}

function nullable(value: unknown) {
  return typeof value === 'string' && value.trim() === ''
    ? null
    : (value ?? null);
}
