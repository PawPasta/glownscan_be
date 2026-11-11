import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { ResponseInterceptor } from './shared/api/response.interceptor.js';
import { setupCors } from './shared/config/cors.config.js';
import { setupSwagger } from './shared/config/swagger.config.js';
import { GlobalExceptionFilter } from './shared/handler/global-exception.filter.js';
import { requestContext } from './shared/observability/request-context.js';
import { HttpLoggingInterceptor } from './shared/observability/http-logging.interceptor.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Config Middlewares, Interceptors, Filters, Pipes, etc.
  setupCors(app);
  setupSwagger(app);
  app.use(requestContext);

  // Global Pipes, Interceptors, Filters
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(
    new HttpLoggingInterceptor(),
    new ResponseInterceptor(),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());

  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
