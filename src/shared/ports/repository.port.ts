export interface PageRequest {
  offset: number;
  limit: number;
}

export interface Page<T> {
  items: T[];
  offset: number;
  limit: number;
  total: number;
}

export interface RepositoryPort<TEntity, TId> {
  findById(id: TId): Promise<TEntity | null>;
  findAll(page: PageRequest): Promise<Page<TEntity>>;
  save(entity: TEntity): Promise<TEntity>;
  existsById(id: TId): Promise<boolean>;
  deleteById(id: TId): Promise<boolean>;
}
