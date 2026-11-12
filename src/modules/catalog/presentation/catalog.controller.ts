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
import {
  CurrentUser,
  type SecurityContext,
} from '../../../shared/security/security.context.js';
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

@ApiTags('products')
@Controller('products')
export class MobileProductController {
  constructor(private readonly catalog: CatalogService) {}

  @Get(':id')
  async getProduct(@Param('id') id: string) {
    const product = (await this.catalog.getProduct(id, true)) as {
      id: string;
      name: string;
      brand: string | null;
      description: string | null;
      imageUrl: string | null;
      ingredients?: Array<{ name: string }>;
    };
    const links = (await this.catalog.listAffiliateLinks(id, true)) as Array<{
      url: string;
    }>;
    return {
      id: product.id,
      name: product.name,
      brand: product.brand,
      description: product.description,
      ingredients: (product.ingredients ?? []).map(
        (ingredient) => ingredient.name,
      ),
      usageInstructions: null,
      warnings: [],
      imageUrls: product.imageUrl ? [product.imageUrl] : [],
      externalUrl: links[0]?.url ?? null,
      affiliateDisclosure: links.length
        ? 'This product link may be an affiliate link.'
        : null,
    };
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
  @Post('ingredients') createIngredient(
    @CurrentUser() user: SecurityContext,
    @Body() body: CreateIngredientDto,
  ) {
    return this.catalog.createIngredient(
      user.userId,
      body as unknown as Record<string, unknown>,
    );
  }
  @Patch('ingredients/:id') updateIngredient(
    @CurrentUser() user: SecurityContext,
    @Param('id') id: string,
    @Body() body: UpdateIngredientDto,
  ) {
    return this.catalog.updateIngredient(
      user.userId,
      id,
      body as Record<string, unknown>,
    );
  }
  @Delete('ingredients/:id') deleteIngredient(
    @CurrentUser() user: SecurityContext,
    @Param('id') id: string,
  ) {
    return this.catalog.deleteIngredient(user.userId, id);
  }

  @Get('skin-concerns') listConcerns(@Query() query: PaginationDto) {
    return this.catalog.listSkinConcerns(options(query, false));
  }
  @Post('skin-concerns') createConcern(
    @CurrentUser() user: SecurityContext,
    @Body() body: CreateSkinConcernDto,
  ) {
    return this.catalog.createSkinConcern(
      user.userId,
      body as unknown as Record<string, unknown>,
    );
  }
  @Patch('skin-concerns/:id') updateConcern(
    @CurrentUser() user: SecurityContext,
    @Param('id') id: string,
    @Body() body: UpdateSkinConcernDto,
  ) {
    return this.catalog.updateSkinConcern(
      user.userId,
      id,
      body as Record<string, unknown>,
    );
  }
  @Delete('skin-concerns/:id') deleteConcern(
    @CurrentUser() user: SecurityContext,
    @Param('id') id: string,
  ) {
    return this.catalog.deleteSkinConcern(user.userId, id);
  }

  @Get('products') listProducts(@Query() query: PaginationDto) {
    return this.catalog.listProducts(options(query, false));
  }
  @Get('products/:id') product(@Param('id') id: string) {
    return this.catalog.getProduct(id, false);
  }
  @Post('products') createProduct(
    @CurrentUser() user: SecurityContext,
    @Body() body: CreateProductDto,
  ) {
    return this.catalog.createProduct(user.userId, body);
  }
  @Patch('products/:id') updateProduct(
    @CurrentUser() user: SecurityContext,
    @Param('id') id: string,
    @Body() body: UpdateProductDto,
  ) {
    return this.catalog.updateProduct(user.userId, id, body);
  }
  @Delete('products/:id') deleteProduct(
    @CurrentUser() user: SecurityContext,
    @Param('id') id: string,
  ) {
    return this.catalog.deleteProduct(user.userId, id);
  }

  @Get('products/:productId/affiliate-links') links(
    @Param('productId') productId: string,
    @Query() query: CatalogStatusDto,
  ) {
    return this.catalog.listAffiliateLinks(productId, query.active !== 'false');
  }
  @Post('products/:productId/affiliate-links') createLink(
    @CurrentUser() user: SecurityContext,
    @Param('productId') productId: string,
    @Body() body: CreateAffiliateLinkDto,
  ) {
    return this.catalog.createAffiliateLink(
      user.userId,
      productId,
      body as unknown as Record<string, unknown>,
    );
  }
  @Patch('affiliate-links/:id') updateLink(
    @CurrentUser() user: SecurityContext,
    @Param('id') id: string,
    @Body() body: UpdateAffiliateLinkDto,
  ) {
    return this.catalog.updateAffiliateLink(
      user.userId,
      id,
      body as Record<string, unknown>,
    );
  }
  @Delete('affiliate-links/:id') deleteLink(
    @CurrentUser() user: SecurityContext,
    @Param('id') id: string,
  ) {
    return this.catalog.deleteAffiliateLink(user.userId, id);
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
