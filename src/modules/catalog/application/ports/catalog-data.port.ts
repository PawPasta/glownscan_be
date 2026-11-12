export const CATALOG_DATA_PORT = Symbol('CATALOG_DATA_PORT');

export interface CatalogListOptions {
  page: number;
  limit: number;
  search?: string;
  activeOnly: boolean;
}

export interface CatalogProductInput {
  name?: string;
  brand?: string;
  description?: string;
  imageUrl?: string;
  isActive?: boolean;
  ingredientIds?: string[];
  skinConcernIds?: string[];
}

export interface CatalogDataPort {
  listIngredients(options: CatalogListOptions): Promise<unknown>;
  listSkinConcerns(options: CatalogListOptions): Promise<unknown>;
  createIngredient(input: Record<string, unknown>): Promise<unknown>;
  updateIngredient(
    id: string,
    input: Record<string, unknown>,
  ): Promise<unknown>;
  deleteIngredient(id: string): Promise<unknown>;
  createSkinConcern(input: Record<string, unknown>): Promise<unknown>;
  updateSkinConcern(
    id: string,
    input: Record<string, unknown>,
  ): Promise<unknown>;
  deleteSkinConcern(id: string): Promise<unknown>;
  listProducts(options: CatalogListOptions): Promise<unknown>;
  getProduct(id: string, activeOnly: boolean): Promise<unknown>;
  createProduct(input: CatalogProductInput): Promise<unknown>;
  updateProduct(id: string, input: CatalogProductInput): Promise<unknown>;
  deleteProduct(id: string): Promise<unknown>;
  listAffiliateLinks(productId: string, activeOnly: boolean): Promise<unknown>;
  createAffiliateLink(
    productId: string,
    input: Record<string, unknown>,
  ): Promise<unknown>;
  updateAffiliateLink(
    id: string,
    input: Record<string, unknown>,
  ): Promise<unknown>;
  deleteAffiliateLink(id: string): Promise<unknown>;
}
