import { Response } from 'express';
import { sendError, sendSuccess } from '../../src/utils/response-formatter';

// Mock Express Response
const mockResponse = () => {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
};

describe('Response Formatter Utils', () => {
  describe('sendSuccess', () => {
    it('should send success response correctly', () => {
      const mockRes = mockResponse();
      const data = { id: 1, name: 'test' };
      
      sendSuccess(mockRes, data, 'Operation successful');
      
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Operation successful',
        data,
        timestamp: expect.any(String)
      });
    });

    it('should use default message when not provided', () => {
      const mockRes = mockResponse();
      const data = { test: true };
      
      sendSuccess(mockRes, data);
      
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: { test: true },
        timestamp: expect.any(String)
      });
    });
  });

  describe('sendError', () => {
    it('should send error response correctly', () => {
      const mockRes = mockResponse();
      const error = new Error('Test error');
      
      sendError(mockRes, 400, error, 'Operation failed');
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Operation failed',
        error: 'Test error',
        timestamp: expect.any(String)
      });
    });

    it('should handle string errors', () => {
      const mockRes = mockResponse();
      
      sendError(mockRes, 500, 'Simple error message', 'Error occurred');
      
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Error occurred',
        error: 'Simple error message',
        timestamp: expect.any(String)
      });
    });

    it('should use default message when not provided', () => {
      const mockRes = mockResponse();
      const error = new Error('Default error');
      
      sendError(mockRes, 500, error);
      
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Default error',
        timestamp: expect.any(String)
      });
    });
  });
});