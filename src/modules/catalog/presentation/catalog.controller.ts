import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../../../shared/security/admin.guard.js';
import { JwtAuthGuard } from '../../../shared/security/jwt-auth.guard.js';
import { CatalogService } from '../application/use-case/catalog.service.js';
import {
  CatalogStatusDto,
  CreateAffiliateLinkDto,
  CreateIngredientDto,
  CreateProductDto,
  CreateSkinConcernDto,
  PaginationDto,
  UpdateAffiliateLinkDto,
  UpdateIngredientDto,
  UpdateProductDto,
  UpdateSkinConcernDto,
} from './catalog.dto.js';

@ApiTags('catalog')
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('ingredients') ingredients(@Query() query: PaginationDto) {
    return this.catalog.listIngredients(options(query, true));
  }
  @Get('skin-concerns') concerns(@Query() query: PaginationDto) {
    return this.catalog.listSkinConcerns(options(query, true));
  }
  @Get('products') products(@Query() query: PaginationDto) {
    return this.catalog.listProducts(options(query, true));
  }
  @Get('products/:productId') product(@Param('productId') productId: string) {
    return this.catalog.getProduct(productId, true);
  }
  @Get('products/:productId/affiliate-links') affiliateLinks(
    @Param('productId') productId: string,
  ) {
    return this.catalog.listAffiliateLinks(productId, true);
  }
}

@ApiTags('admin-catalog')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/catalog')
export class AdminCatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('ingredients') listIngredients(@Query() query: PaginationDto) {
    return this.catalog.listIngredients(options(query, false));
  }
  @Post('ingredients') createIngredient(@Body() body: CreateIngredientDto) {
    return this.catalog.createIngredient(
      body as unknown as Record<string, unknown>,
    );
  }
  @Patch('ingredients/:id') updateIngredient(
    @Param('id') id: string,
    @Body() body: UpdateIngredientDto,
  ) {
    return this.catalog.updateIngredient(id, body as Record<string, unknown>);
  }
  @Delete('ingredients/:id') deleteIngredient(@Param('id') id: string) {
    return this.catalog.deleteIngredient(id);
  }

  @Get('skin-concerns') listConcerns(@Query() query: PaginationDto) {
    return this.catalog.listSkinConcerns(options(query, false));
  }
  @Post('skin-concerns') createConcern(@Body() body: CreateSkinConcernDto) {
    return this.catalog.createSkinConcern(
      body as unknown as Record<string, unknown>,
    );
  }
  @Patch('skin-concerns/:id') updateConcern(
    @Param('id') id: string,
    @Body() body: UpdateSkinConcernDto,
  ) {
    return this.catalog.updateSkinConcern(id, body as Record<string, unknown>);
  }
  @Delete('skin-concerns/:id') deleteConcern(@Param('id') id: string) {
    return this.catalog.deleteSkinConcern(id);
  }

  @Get('products') listProducts(@Query() query: PaginationDto) {
    return this.catalog.listProducts(options(query, false));
  }
  @Get('products/:id') product(@Param('id') id: string) {
    return this.catalog.getProduct(id, false);
  }
  @Post('products') createProduct(@Body() body: CreateProductDto) {
    return this.catalog.createProduct(body);
  }
  @Patch('products/:id') updateProduct(
    @Param('id') id: string,
    @Body() body: UpdateProductDto,
  ) {
    return this.catalog.updateProduct(id, body);
  }
  @Delete('products/:id') deleteProduct(@Param('id') id: string) {
    return this.catalog.deleteProduct(id);
  }

  @Get('products/:productId/affiliate-links') links(
    @Param('productId') productId: string,
    @Query() query: CatalogStatusDto,
  ) {
    return this.catalog.listAffiliateLinks(productId, query.active !== 'false');
  }
  @Post('products/:productId/affiliate-links') createLink(
    @Param('productId') productId: string,
    @Body() body: CreateAffiliateLinkDto,
  ) {
    return this.catalog.createAffiliateLink(
      productId,
      body as unknown as Record<string, unknown>,
    );
  }
  @Patch('affiliate-links/:id') updateLink(
    @Param('id') id: string,
    @Body() body: UpdateAffiliateLinkDto,
  ) {
    return this.catalog.updateAffiliateLink(
      id,
      body as Record<string, unknown>,
    );
  }
  @Delete('affiliate-links/:id') deleteLink(@Param('id') id: string) {
    return this.catalog.deleteAffiliateLink(id);
  }
}

function options(query: PaginationDto, activeOnly: boolean) {
  return {
    page: query.page,
    limit: query.limit,
    search: query.search,
    activeOnly,
  };
}
