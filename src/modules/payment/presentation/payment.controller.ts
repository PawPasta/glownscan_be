import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../../../shared/security/jwt-auth.guard.js';
import {
  CurrentUser,
  type SecurityContext,
} from '../../../shared/security/security.context.js';
import { ForbiddenException } from '../../../shared/handler/http.exceptions.js';
import { PaymentService } from '../application/use-case/payment.service.js';
import {
  CancelPaymentOrderDto,
  CreatePremiumCheckoutDto,
  CreateTopUpDto,
  RefundPaymentOrderDto,
  SePayWebhookDto,
} from './payment.dto.js';

type RawBodyRequest = Request & { rawBody?: Buffer };

@ApiTags('payment')
@Controller('payment')
export class PaymentController {
  constructor(private readonly payment: PaymentService) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('top-ups')
  createTopUp(
    @CurrentUser() user: SecurityContext,
    @Body() body: CreateTopUpDto,
  ) {
    return this.payment.createTopUp(user.userId, body.amountVnd);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('premium-checkouts')
  createPremiumCheckout(
    @CurrentUser() user: SecurityContext,
    @Body() body: CreatePremiumCheckoutDto,
  ) {
    return this.payment.createPremiumCheckout(user.userId, body.packageCode);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('wallet')
  wallet(@CurrentUser() user: SecurityContext) {
    return this.payment.getWallet(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('wallet/transactions')
  transactions(
    @CurrentUser() user: SecurityContext,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
    const safeLimit = Math.min(
      100,
      Math.max(1, Number.parseInt(limit, 10) || 20),
    );
    return this.payment.listTransactions(user.userId, safePage, safeLimit);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('orders/:orderId/cancel')
  cancel(
    @CurrentUser() user: SecurityContext,
    @Param('orderId') orderId: string,
    @Body() body: CancelPaymentOrderDto,
  ) {
    return this.payment.cancelOrder(user.userId, orderId, body.cancelReason);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('orders/:orderId')
  order(
    @CurrentUser() user: SecurityContext,
    @Param('orderId') orderId: string,
  ) {
    return this.payment.getOrder(user.userId, orderId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('admin/orders/:orderId/refund')
  refund(
    @CurrentUser() user: SecurityContext,
    @Param('orderId') orderId: string,
    @Body() body: RefundPaymentOrderDto,
  ) {
    if (!user.roles.includes('ADMIN'))
      throw new ForbiddenException('Administrator role is required.');
    return this.payment.refundOrder(orderId, body.reason);
  }

  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Req() request: RawBodyRequest,
    @Res() response: Response,
    @Headers('x-sepay-signature') signature: string | undefined,
    @Headers('x-sepay-timestamp') timestamp: string | undefined,
    @Body() payload: SePayWebhookDto,
  ) {
    this.payment.verifyWebhook(request.rawBody, signature, timestamp);
    await this.payment.processWebhook(payload);
    response.status(200).json({ success: true });
  }
}
