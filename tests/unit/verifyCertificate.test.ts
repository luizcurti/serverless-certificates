// Mock DynamoDB client
const mockDocumentSend = jest.fn();

jest.mock('../../src/utils/dynamodbClient', () => ({
  document: {
    send: mockDocumentSend,
  },
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  GetCommand: jest.fn(),
}));

import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from '../../src/functions/verifyCertificate';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';

describe('verifyCertificate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.S3_BUCKET_NAME = 'certificadoignite2021';
  });

  it('should be defined', () => {
    expect(typeof handler).toBe('function');
  });

  it('should handle missing path parameters', async () => {
    const mockEvent = {
      pathParameters: null,
    } as unknown as APIGatewayProxyEvent;
    const mockContext = {} as Context;
    const mockCallback = jest.fn();

    const result = await handler(mockEvent, mockContext, mockCallback);

    expect(result).toEqual({
      statusCode: 400,
      body: JSON.stringify({
        message: 'Certificate ID is required',
      }),
    });
  });

  it('should handle missing id in path parameters', async () => {
    const mockEvent = {
      pathParameters: {},
    } as unknown as APIGatewayProxyEvent;
    const mockContext = {} as Context;
    const mockCallback = jest.fn();

    const result = await handler(mockEvent, mockContext, mockCallback);

    expect(result).toEqual({
      statusCode: 400,
      body: JSON.stringify({
        message: 'Certificate ID is required',
      }),
    });
  });

  it('should return 500 when S3_BUCKET_NAME is not configured', async () => {
    delete process.env.S3_BUCKET_NAME;

    const mockEvent = {
      pathParameters: { id: 'test123' },
    } as unknown as APIGatewayProxyEvent;
    const mockContext = {} as Context;
    const mockCallback = jest.fn();

    const result = await handler(mockEvent, mockContext, mockCallback);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body)).toEqual({ message: 'Internal server error' });
  });

  it('should return certificate when user exists', async () => {
    const mockEvent = {
      pathParameters: {
        id: 'test123',
      },
    } as unknown as APIGatewayProxyEvent;
    const mockContext = {} as Context;
    const mockCallback = jest.fn();

    const mockUser = {
      id: 'test123',
      name: 'John Doe',
      grade: 'A+',
      created_at: 1634567890,
    };

    mockDocumentSend.mockResolvedValueOnce({
      Item: mockUser,
    });

    const result = await handler(mockEvent, mockContext, mockCallback);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toEqual({
      message: 'Valid certificate',
      name: 'John Doe',
      url: 'https://certificadoignite2021.s3.amazonaws.com/test123.pdf',
    });

    expect(mockDocumentSend).toHaveBeenCalledTimes(1);
    expect(GetCommand).toHaveBeenCalledWith({
      TableName: 'users_certificate',
      Key: { id: 'test123' },
    });
  });

  it('should return 404 when user does not exist', async () => {
    const mockEvent = {
      pathParameters: {
        id: 'nonexistent123',
      },
    } as unknown as APIGatewayProxyEvent;
    const mockContext = {} as Context;
    const mockCallback = jest.fn();

    mockDocumentSend.mockResolvedValueOnce({
      Item: undefined,
    });

    const result = await handler(mockEvent, mockContext, mockCallback);

    expect(result!.statusCode).toBe(404);
    expect(JSON.parse(result!.body)).toEqual({
      message: 'Certificate not found',
    });

    expect(mockDocumentSend).toHaveBeenCalledTimes(1);
    expect(GetCommand).toHaveBeenCalledWith({
      TableName: 'users_certificate',
      Key: { id: 'nonexistent123' },
    });
  });

  it('should return 500 on a DynamoDB error', async () => {
    const mockEvent = {
      pathParameters: {
        id: 'test123',
      },
    } as unknown as APIGatewayProxyEvent;
    const mockContext = {} as Context;
    const mockCallback = jest.fn();

    mockDocumentSend.mockRejectedValueOnce(new Error('DynamoDB Connection Error'));

    const result = await handler(mockEvent, mockContext, mockCallback);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body)).toEqual({ message: 'Internal server error' });
    expect(mockDocumentSend).toHaveBeenCalledTimes(1);
  });

  it('should work with different user data', async () => {
    const mockEvent = {
      pathParameters: {
        id: 'user456',
      },
    } as unknown as APIGatewayProxyEvent;
    const mockContext = {} as Context;
    const mockCallback = jest.fn();

    const mockUser = {
      id: 'user456',
      name: 'Jane Smith',
      grade: 'B',
      created_at: 1634567891,
    };

    mockDocumentSend.mockResolvedValueOnce({
      Item: mockUser,
    });

    const result = await handler(mockEvent, mockContext, mockCallback);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toEqual({
      message: 'Valid certificate',
      name: 'Jane Smith',
      url: 'https://certificadoignite2021.s3.amazonaws.com/user456.pdf',
    });
  });
});
