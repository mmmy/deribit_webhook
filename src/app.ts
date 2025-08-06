import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { routes } from './routes';
import { ErrorHandler } from './middleware/error-handler';

export function createApp(): express.Application {
  const app = express();

  // Security and CORS middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
  }));
  
  app.use(cors());
  app.use(morgan('combined'));
  app.use(express.json());

  // Static file serving
  app.use(express.static('public'));

  // Routes
  app.use('/', routes);

  // Global error handler
  app.use(ErrorHandler.handle);

  return app;
}