import { PEACError } from '../../src/errors/problem-json';

describe('PEACError', () => {
  describe('constructor', () => {
    it('should create error with all parameters', () => {
      const error = new PEACError('test_error', 'Test message', 400, 'Detailed description');
      
      expect(error.type).toBe('test_error');
      expect(error.message).toBe('Test message');
      expect(error.status).toBe(400);
      expect(error.detail).toBe('Detailed description');
      expect(error.trace_id).toMatch(/^[a-f0-9]{32}$/);
      expect(error.name).toBe('PEACError');
    });

    it('should create error with default status 500', () => {
      const error = new PEACError('test_error', 'Test message');
      
      expect(error.status).toBe(500);
      expect(error.detail).toBe('Test message');
    });

    it('should create error with custom status and no detail', () => {
      const error = new PEACError('test_error', 'Test message', 404);
      
      expect(error.status).toBe(404);
      expect(error.detail).toBe('Test message');
    });

    it('should use detail when provided even with custom status', () => {
      const error = new PEACError('test_error', 'Test message', 403, 'Custom detail');
      
      expect(error.detail).toBe('Custom detail');
    });

    it('should generate unique trace IDs', () => {
      const error1 = new PEACError('test_error', 'Message 1');
      const error2 = new PEACError('test_error', 'Message 2');
      
      expect(error1.trace_id).not.toBe(error2.trace_id);
      expect(error1.trace_id).toMatch(/^[a-f0-9]{32}$/);
      expect(error2.trace_id).toMatch(/^[a-f0-9]{32}$/);
    });
  });

  describe('handler', () => {
    let mockReq;
    let mockRes;
    let mockNext;

    beforeEach(() => {
      mockReq = {
        originalUrl: '/test/path',
      };

      mockRes = {
        status: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };

      mockNext = jest.fn();
    });

    it('should handle PEACError instances correctly', () => {
      const peacError = new PEACError('validation_error', 'Invalid input', 400, 'Field is required');
      
      PEACError.handler(peacError, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.set).toHaveBeenCalledWith('Content-Type', 'application/problem+json');
      expect(mockRes.json).toHaveBeenCalledWith({
        type: 'https://docs.peacprotocol.org/problems/validation_error',
        title: 'Invalid input',
        status: 400,
        detail: 'Field is required',
        instance: '/test/path',
        trace_id: peacError.trace_id,
      });
    });

    it('should handle PEACError with default status', () => {
      const peacError = new PEACError('server_error', 'Something went wrong');
      
      PEACError.handler(peacError, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        type: 'https://docs.peacprotocol.org/problems/server_error',
        title: 'Something went wrong',
        status: 500,
        detail: 'Something went wrong',
        instance: '/test/path',
        trace_id: peacError.trace_id,
      });
    });

    it('should handle standard Error instances', () => {
      const standardError = new Error('Standard error message');
      
      PEACError.handler(standardError, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.set).toHaveBeenCalledWith('Content-Type', 'application/problem+json');
      
      const jsonCall = mockRes.json.mock.calls[0][0];
      expect(jsonCall.type).toBe('https://docs.peacprotocol.org/problems/internal_server_error');
      expect(jsonCall.title).toBe('Internal Server Error');
      expect(jsonCall.status).toBe(500);
      expect(jsonCall.trace_id).toMatch(/^[a-f0-9]{32}$/);
      expect(jsonCall).not.toHaveProperty('instance');
      expect(jsonCall).not.toHaveProperty('detail');
    });

    it('should handle non-Error objects', () => {
      const nonError = 'String error';
      
      PEACError.handler(nonError, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.set).toHaveBeenCalledWith('Content-Type', 'application/problem+json');
      
      const jsonCall = mockRes.json.mock.calls[0][0];
      expect(jsonCall.type).toBe('https://docs.peacprotocol.org/problems/internal_server_error');
      expect(jsonCall.title).toBe('Internal Server Error');
      expect(jsonCall.status).toBe(500);
      expect(jsonCall.trace_id).toMatch(/^[a-f0-9]{32}$/);
    });

    it('should generate different trace IDs for different standard errors', () => {
      const error1 = new Error('Error 1');
      const error2 = new Error('Error 2');
      
      PEACError.handler(error1, mockReq, mockRes, mockNext);
      PEACError.handler(error2, mockReq, mockRes, mockNext);

      const jsonCalls = mockRes.json.mock.calls;
      expect(jsonCalls[0][0].trace_id).not.toBe(jsonCalls[1][0].trace_id);
    });

    it('should work with different request URLs', () => {
      const peacError = new PEACError('test_error', 'Test message', 404);
      mockReq.originalUrl = '/different/path';
      
      PEACError.handler(peacError, mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          instance: '/different/path',
        })
      );
    });

    it('should handle missing originalUrl', () => {
      const peacError = new PEACError('test_error', 'Test message', 404);
      mockReq.originalUrl = undefined;
      
      PEACError.handler(peacError, mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          instance: undefined,
        })
      );
    });
  });
});