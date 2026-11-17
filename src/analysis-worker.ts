import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

process.env.GLOWNSCAN_ANALYSIS_WORKER_ENABLED = 'true';
process.env.GLOWNSCAN_ANALYSIS_WEBSOCKET_ENABLED = 'false';

const app = await NestFactory.createApplicationContext(AppModule);
app.enableShutdownHooks();
