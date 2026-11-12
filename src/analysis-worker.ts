import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

process.env.GLOWNSCAN_ANALYSIS_WORKER_ENABLED = 'true';

const app = await NestFactory.createApplicationContext(AppModule);
app.enableShutdownHooks();
