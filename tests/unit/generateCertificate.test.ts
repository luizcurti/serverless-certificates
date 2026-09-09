// Mock all external dependencies for generateCertificate tests
const mockDocumentSendGenerate = jest.fn();
const mockS3Send = jest.fn();
const mockPuppeteerPage = {
  setContent: jest.fn(),
  pdf: jest.fn().mockResolvedValue(Buffer.from('mock-pdf-content')),
};
const mockPuppeteerBrowser = {
  newPage: jest.fn().mockResolvedValue(mockPuppeteerPage),
  close: jest.fn(),
};

jest.mock('../../src/utils/dynamodbClient', () => ({
  document: {
    send: mockDocumentSendGenerate,
  },
}));

jest.mock('@aws-sdk/client-dynamodb', () => ({
  ConditionalCheckFailedException: class ConditionalCheckFailedException extends Error {},
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  GetCommand: jest.fn(),
  PutCommand: jest.fn(),
  DeleteCommand: jest.fn(),
}));

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({
    send: mockS3Send,
  })),
  PutObjectCommand: jest.fn(),
}));

const mockSsmSend = jest.fn();

jest.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: jest.fn(() => ({
    send: mockSsmSend,
  })),
  GetParameterCommand: jest.fn(),
}));

jest.mock('handlebars', () => ({
  compile: jest.fn(() => jest.fn(() => '<html>Mock Certificate</html>')),
}));

const mockPuppeteerLaunch = jest.fn().mockResolvedValue(mockPuppeteerBrowser);

jest.mock('puppeteer-core', () => ({
  __esModule: true,
  default: {
    launch: mockPuppeteerLaunch,
  },
}));

jest.mock('@sparticuz/chromium', () => ({
  __esModule: true,
  default: {
    args: [],
    executablePath: jest.fn().mockResolvedValue('/mock/chrome/path'),
  },
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn((path: string) => {
    if (path.includes('certificate.hbs')) {
      return '<html>{{name}} - {{grade}}</html>';
    }
    if (path.includes('stamp.png')) {
      return Buffer.from('mock-image-data').toString('base64');
    }
    return 'mock file content';
  }),
}));

jest.mock('dayjs', () => {
  return jest.fn(() => ({
    format: jest.fn(() => '15/10/2025'),
  }));
});

// Get references to mocked modules
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import chromium from '@sparticuz/chromium';
import { compile } from 'handlebars';
import fs from 'fs';

describe('generateCertificate', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { handler } = require('../../src/functions/generateCertificate');

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.IS_OFFLINE = 'true';
    process.env.S3_BUCKET_NAME = 'certificadoignite2021';
    delete process.env.API_KEY_PARAMETER_NAME;
  });

  it('should be defined', () => {
    expect(typeof handler).toBe('function');
  });

  it('should return 401 when the x-api-key header is missing', async () => {
    const mockEvent = {
      body: JSON.stringify({ id: 'test123', name: 'John Doe', grade: 'A+' }),
    };
    const mockContext = {};
    const mockCallback = jest.fn();

    const result = await handler(mockEvent, mockContext, mockCallback);

    expect(result).toEqual({
      statusCode: 401,
      body: JSON.stringify({ message: 'Invalid or missing API key' }),
    });
  });

  it('should return 401 when the x-api-key header is wrong', async () => {
    const mockEvent = {
      headers: { 'x-api-key': 'wrong-key' },
      body: JSON.stringify({ id: 'test123', name: 'John Doe', grade: 'A+' }),
    };
    const mockContext = {};
    const mockCallback = jest.fn();

    const result = await handler(mockEvent, mockContext, mockCallback);

    expect(result).toEqual({
      statusCode: 401,
      body: JSON.stringify({ message: 'Invalid or missing API key' }),
    });
  });

  it('should fetch the API key from SSM when not running offline', async () => {
    jest.resetModules();
    delete process.env.IS_OFFLINE;
    process.env.API_KEY_PARAMETER_NAME = '/test/generateCertificate/apiKey';
    mockSsmSend.mockResolvedValueOnce({ Parameter: { Value: 'ssm-api-key' } });
    mockDocumentSendGenerate.mockResolvedValueOnce({});
    mockS3Send.mockResolvedValue({});

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { handler: freshHandler } = require('../../src/functions/generateCertificate');

    const mockEvent = {
      headers: { 'x-api-key': 'ssm-api-key' },
      body: JSON.stringify({ id: 'test123', name: 'John Doe', grade: 'A+' }),
    };

    const result = await freshHandler(mockEvent, {}, jest.fn());

    expect(result.statusCode).toBe(201);
    expect(mockSsmSend).toHaveBeenCalledTimes(1);
  });

  it('should fall back to default AWS region and S3 endpoint when not configured', async () => {
    jest.resetModules();
    const originalAwsRegion = process.env.AWS_REGION;
    const originalS3Endpoint = process.env.S3_ENDPOINT;
    delete process.env.IS_OFFLINE;
    delete process.env.AWS_REGION;
    delete process.env.S3_ENDPOINT;
    process.env.API_KEY_PARAMETER_NAME = '/test/generateCertificate/apiKey';
    mockSsmSend.mockResolvedValueOnce({ Parameter: { Value: 'ssm-api-key' } });
    mockDocumentSendGenerate.mockResolvedValueOnce({});
    mockS3Send.mockResolvedValue({});

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { handler: freshHandler } = require('../../src/functions/generateCertificate');

      const mockEvent = {
        headers: { 'x-api-key': 'ssm-api-key' },
        body: JSON.stringify({ id: 'test123', name: 'John Doe', grade: 'A+' }),
      };

      const result = await freshHandler(mockEvent, {}, jest.fn());

      expect(result.statusCode).toBe(201);
    } finally {
      process.env.AWS_REGION = originalAwsRegion;
      process.env.S3_ENDPOINT = originalS3Endpoint;
    }
  });

  it('should return 401 when not running offline and API_KEY_PARAMETER_NAME is not configured', async () => {
    jest.resetModules();
    delete process.env.IS_OFFLINE;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { handler: freshHandler } = require('../../src/functions/generateCertificate');

    const mockEvent = {
      headers: { 'x-api-key': 'anything' },
      body: JSON.stringify({ id: 'test123', name: 'John Doe', grade: 'A+' }),
    };

    const result = await freshHandler(mockEvent, {}, jest.fn());

    expect(result).toEqual({
      statusCode: 401,
      body: JSON.stringify({ message: 'Invalid or missing API key' }),
    });
    expect(mockSsmSend).not.toHaveBeenCalled();
  });

  it('should return 500 when SSM fails to return the API key', async () => {
    jest.resetModules();
    delete process.env.IS_OFFLINE;
    process.env.API_KEY_PARAMETER_NAME = '/test/generateCertificate/apiKey';
    mockSsmSend.mockRejectedValueOnce(new Error('SSM unavailable'));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { handler: freshHandler } = require('../../src/functions/generateCertificate');

    const mockEvent = {
      headers: { 'x-api-key': 'anything' },
      body: JSON.stringify({ id: 'test123', name: 'John Doe', grade: 'A+' }),
    };

    const result = await freshHandler(mockEvent, {}, jest.fn());

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ message: 'Internal server error' });
  });

  it('should return 400 when body is missing', async () => {
    const mockEvent = {
      headers: { 'x-api-key': 'test-api-key' },
      body: null,
    };
    const mockContext = {};
    const mockCallback = jest.fn();

    const result = await handler(mockEvent, mockContext, mockCallback);

    expect(result).toEqual({
      statusCode: 400,
      body: JSON.stringify({
        message: 'Request body is required',
      }),
    });
  });

  it('should handle invalid JSON in request body', async () => {
    const mockEvent = {
      headers: { 'x-api-key': 'test-api-key' },
      body: 'invalid json',
    };
    const mockContext = {};
    const mockCallback = jest.fn();

    const result = await handler(mockEvent, mockContext, mockCallback);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      message: 'Invalid JSON in request body',
    });
  });

  it('should validate required fields in request body', async () => {
    const mockEvent = {
      headers: { 'x-api-key': 'test-api-key' },
      body: JSON.stringify({
        // Missing required fields like id, name, grade
      }),
    };
    const mockContext = {};
    const mockCallback = jest.fn();

    const result = await handler(mockEvent, mockContext, mockCallback);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      message: 'id, name and grade are required',
    });
  });

  it('should return 400 when id contains characters outside the allowed pattern', async () => {
    const mockEvent = {
      headers: { 'x-api-key': 'test-api-key' },
      body: JSON.stringify({ id: 'test/../123', name: 'John Doe', grade: 'A+' }),
    };
    const mockContext = {};
    const mockCallback = jest.fn();

    const result = await handler(mockEvent, mockContext, mockCallback);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      message: 'id must contain only letters, numbers, "_" and "-", up to 64 characters',
    });
  });

  it('should return 400 when name exceeds the max length', async () => {
    const mockEvent = {
      headers: { 'x-api-key': 'test-api-key' },
      body: JSON.stringify({ id: 'test123', name: 'a'.repeat(101), grade: 'A+' }),
    };
    const mockContext = {};
    const mockCallback = jest.fn();

    const result = await handler(mockEvent, mockContext, mockCallback);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      message: 'name and grade must be at most 100 characters',
    });
  });

  it('should return 400 when grade exceeds the max length', async () => {
    const mockEvent = {
      headers: { 'x-api-key': 'test-api-key' },
      body: JSON.stringify({ id: 'test123', name: 'John Doe', grade: 'a'.repeat(101) }),
    };
    const mockContext = {};
    const mockCallback = jest.fn();

    const result = await handler(mockEvent, mockContext, mockCallback);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      message: 'name and grade must be at most 100 characters',
    });
  });

  it('should return 500 when S3_BUCKET_NAME is not configured', async () => {
    delete process.env.S3_BUCKET_NAME;

    const mockEvent = {
      headers: { 'x-api-key': 'test-api-key' },
      body: JSON.stringify({ id: 'test123', name: 'John Doe', grade: 'A+' }),
    };
    const mockContext = {};
    const mockCallback = jest.fn();

    const result = await handler(mockEvent, mockContext, mockCallback);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ message: 'Internal server error' });
  });

  it('should generate certificate for new user', async () => {
    const mockEvent = {
      headers: { 'x-api-key': 'test-api-key' },
      body: JSON.stringify({
        id: 'test123',
        name: 'John Doe',
        grade: 'A+',
      }),
    };
    const mockContext = {};
    const mockCallback = jest.fn();

    // Mock DynamoDB conditional put (id doesn't exist yet)
    mockDocumentSendGenerate.mockResolvedValueOnce({});

    // Mock S3 upload
    mockS3Send.mockResolvedValue({});

    const result = await handler(mockEvent, mockContext, mockCallback);

    expect(result.statusCode).toBe(201);
    expect(JSON.parse(result.body)).toEqual({
      message: 'Certificate created successfully',
      url: 'https://certificadoignite2021.s3.amazonaws.com/test123.pdf',
    });

    expect(mockDocumentSendGenerate).toHaveBeenCalledTimes(1);
    expect(PutCommand).toHaveBeenCalledWith({
      TableName: 'users_certificate',
      Item: {
        id: 'test123',
        name: 'John Doe',
        grade: 'A+',
        created_at: expect.any(Number),
      },
      ConditionExpression: 'attribute_not_exists(id)',
    });
  });

  it('should return the existing record without regenerating the PDF when id already exists', async () => {
    const mockEvent = {
      headers: { 'x-api-key': 'test-api-key' },
      body: JSON.stringify({
        id: 'existing123',
        name: 'Jane Doe',
        grade: 'B+',
      }),
    };
    const mockContext = {};
    const mockCallback = jest.fn();

    // Mock DynamoDB conditional put failing because the id already exists
    mockDocumentSendGenerate.mockRejectedValueOnce(
      new ConditionalCheckFailedException({
        message: 'The conditional request failed',
        $metadata: {},
      }),
    );
    // Mock the follow-up read of the existing record
    mockDocumentSendGenerate.mockResolvedValueOnce({
      Item: { id: 'existing123', name: 'Jane Doe', grade: 'B+' },
    });

    const result = await handler(mockEvent, mockContext, mockCallback);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      message: 'Certificate already exists',
      name: 'Jane Doe',
      url: 'https://certificadoignite2021.s3.amazonaws.com/existing123.pdf',
    });

    expect(mockDocumentSendGenerate).toHaveBeenCalledTimes(2); // conditional put + get
    expect(GetCommand).toHaveBeenCalledWith({
      TableName: 'users_certificate',
      Key: { id: 'existing123' },
    });

    // The expensive path (render + upload) must never run for an existing id
    expect(mockPuppeteerLaunch).not.toHaveBeenCalled();
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  it('should fall back to the submitted name if the record was deleted between the conflict and the read', async () => {
    const mockEvent = {
      headers: { 'x-api-key': 'test-api-key' },
      body: JSON.stringify({
        id: 'existing123',
        name: 'Jane Doe',
        grade: 'B+',
      }),
    };
    const mockContext = {};
    const mockCallback = jest.fn();

    mockDocumentSendGenerate.mockRejectedValueOnce(
      new ConditionalCheckFailedException({
        message: 'The conditional request failed',
        $metadata: {},
      }),
    );
    // The record was deleted by another process between the conditional put
    // failing and this read - GetCommand returns nothing.
    mockDocumentSendGenerate.mockResolvedValueOnce({ Item: undefined });

    const result = await handler(mockEvent, mockContext, mockCallback);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      message: 'Certificate already exists',
      name: 'Jane Doe',
      url: 'https://certificadoignite2021.s3.amazonaws.com/existing123.pdf',
    });
  });

  it('should return 500 on an unexpected DynamoDB error', async () => {
    const mockEvent = {
      headers: { 'x-api-key': 'test-api-key' },
      body: JSON.stringify({
        id: 'test123',
        name: 'John Doe',
        grade: 'A+',
      }),
    };
    const mockContext = {};
    const mockCallback = jest.fn();

    mockDocumentSendGenerate.mockRejectedValueOnce(new Error('DynamoDB Error'));

    const result = await handler(mockEvent, mockContext, mockCallback);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ message: 'Internal server error' });
  });

  it('should return 500 on an S3 upload error', async () => {
    const mockEvent = {
      headers: { 'x-api-key': 'test-api-key' },
      body: JSON.stringify({
        id: 'test123',
        name: 'John Doe',
        grade: 'A+',
      }),
    };
    const mockContext = {};
    const mockCallback = jest.fn();

    mockDocumentSendGenerate.mockResolvedValueOnce({});
    mockS3Send.mockRejectedValue(new Error('S3 Error'));

    const result = await handler(mockEvent, mockContext, mockCallback);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ message: 'Internal server error' });
  });

  it('should roll back the DynamoDB reservation when PDF generation fails, allowing a retry', async () => {
    const mockEvent = {
      headers: { 'x-api-key': 'test-api-key' },
      body: JSON.stringify({
        id: 'test123',
        name: 'John Doe',
        grade: 'A+',
      }),
    };

    mockDocumentSendGenerate.mockResolvedValueOnce({});
    mockPuppeteerLaunch.mockRejectedValueOnce(new Error('Puppeteer Error'));

    const failedResult = await handler(mockEvent, {}, jest.fn());

    expect(failedResult.statusCode).toBe(500);
    expect(DeleteCommand).toHaveBeenCalledWith({
      TableName: 'users_certificate',
      Key: { id: 'test123' },
    });
    expect(mockDocumentSendGenerate).toHaveBeenCalledTimes(2);

    jest.clearAllMocks();
    mockDocumentSendGenerate.mockResolvedValueOnce({});
    mockS3Send.mockResolvedValue({});

    const retryResult = await handler(mockEvent, {}, jest.fn());

    expect(retryResult.statusCode).toBe(201);
  });

  it('should still return 500 when the rollback delete itself fails', async () => {
    const mockEvent = {
      headers: { 'x-api-key': 'test-api-key' },
      body: JSON.stringify({
        id: 'test123',
        name: 'John Doe',
        grade: 'A+',
      }),
    };

    mockDocumentSendGenerate.mockResolvedValueOnce({});
    mockDocumentSendGenerate.mockRejectedValueOnce(new Error('Delete failed'));
    mockPuppeteerLaunch.mockRejectedValueOnce(new Error('Puppeteer Error'));

    const result = await handler(mockEvent, {}, jest.fn());

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ message: 'Internal server error' });
    expect(DeleteCommand).toHaveBeenCalledWith({
      TableName: 'users_certificate',
      Key: { id: 'test123' },
    });
  });

  it('should return 500 on a PDF generation error', async () => {
    const mockEvent = {
      headers: { 'x-api-key': 'test-api-key' },
      body: JSON.stringify({
        id: 'test123',
        name: 'John Doe',
        grade: 'A+',
      }),
    };
    const mockContext = {};
    const mockCallback = jest.fn();

    mockDocumentSendGenerate.mockResolvedValueOnce({});
    mockPuppeteerLaunch.mockRejectedValueOnce(new Error('Puppeteer Error'));

    const result = await handler(mockEvent, mockContext, mockCallback);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ message: 'Internal server error' });
  });

  it('should read template and stamp files correctly', async () => {
    const mockEvent = {
      headers: { 'x-api-key': 'test-api-key' },
      body: JSON.stringify({
        id: 'test123',
        name: 'John Doe',
        grade: 'A+',
      }),
    };
    const mockContext = {};
    const mockCallback = jest.fn();

    mockDocumentSendGenerate.mockResolvedValueOnce({});
    mockS3Send.mockResolvedValue({});

    await handler(mockEvent, mockContext, mockCallback);

    expect(fs.readFileSync).toHaveBeenCalledWith(
      expect.stringContaining('certificate.hbs'),
      'utf8',
    );
    expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('stamp.png'), 'base64');
    expect(compile).toHaveBeenCalledWith('<html>{{name}} - {{grade}}</html>');
  });

  it('should handle Chrome/Puppeteer configuration correctly', async () => {
    const mockEvent = {
      headers: { 'x-api-key': 'test-api-key' },
      body: JSON.stringify({
        id: 'test123',
        name: 'John Doe',
        grade: 'A+',
      }),
    };
    const mockContext = {};
    const mockCallback = jest.fn();

    mockDocumentSendGenerate.mockResolvedValueOnce({});
    mockS3Send.mockResolvedValue({});

    await handler(mockEvent, mockContext, mockCallback);

    // Verify Puppeteer was configured with correct options
    expect(mockPuppeteerLaunch).toHaveBeenCalledWith({
      args: chromium.args,
      executablePath: '/mock/chrome/path',
      headless: true,
    });
  });

  it('should generate PDF with correct content', async () => {
    const mockEvent = {
      headers: { 'x-api-key': 'test-api-key' },
      body: JSON.stringify({
        id: 'test123',
        name: 'Test User',
        grade: 'A++',
      }),
    };
    const mockContext = {};
    const mockCallback = jest.fn();

    mockDocumentSendGenerate.mockResolvedValueOnce({});
    mockS3Send.mockResolvedValue({});

    await handler(mockEvent, mockContext, mockCallback);

    // Verify template compilation was called
    expect(compile).toHaveBeenCalled();

    // Verify PDF generation options
    expect(mockPuppeteerPage.pdf).toHaveBeenCalledWith({
      format: 'a4',
      landscape: true,
      preferCSSPageSize: true,
      printBackground: true,
    });
  });
});
