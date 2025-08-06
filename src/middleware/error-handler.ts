import { Request, Response, NextFunction } from 'express';

export interface ErrorResponse {
  success: boolean;
  message: string;
  error?: string;
  timestamp: string;
  requestId?: string;
  code?: string;
}

export class ErrorHandler {
  static handle(error: Error, req: Request, res: Response, next: NextFunction): void {
    const requestId = req.headers['x-request-id'] as string || 
                     `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    console.error(`[${requestId}] Error:`, error);

    const response: ErrorResponse = {
      success: false,
      message: error.message || 'Internal server error',
      timestamp: new Date().toISOString(),
      requestId
    };

    // Add error details in development
    if (process.env.NODE_ENV === 'development') {
      response.error = error.stack;
    }

    // Determine status code based on error type
    let statusCode = 500;
    
    if (error.name === 'ValidationError') statusCode = 400;
    if (error.name === 'UnauthorizedError') statusCode = 401;
    if (error.name === 'NotFoundError') statusCode = 404;

    res.status(statusCode).json(response);
  }
}