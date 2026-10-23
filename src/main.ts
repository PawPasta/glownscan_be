import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ResponseInterceptor } from './shared/api/response.interceptor.js';
import { setupCors } from './shared/config/cors.config.js';
import { setupSwagger } from './shared/config/swagger.config.js';
import { GlobalExceptionFilter } from './shared/handler/global-exception.filter.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  setupCors(app);
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new GlobalExceptionFilter());
  setupSwagger(app);
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
