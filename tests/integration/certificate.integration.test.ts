import { handler as generateHandler } from '../../src/functions/generateCertificate';
import { handler as verifyHandler } from '../../src/functions/verifyCertificate';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { waitForLocalStack } from './setup';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand } from '@aws-sdk/lib-dynamodb';

describe('Certificate Integration Tests', () => {
  const mockContext = {} as Context;
  const mockCallback = jest.fn();

  let docClient: DynamoDBDocumentClient;

  beforeAll(async () => {
    await waitForLocalStack();

    const client = new DynamoDBClient({
      region: process.env.AWS_REGION,
      endpoint: process.env.DYNAMODB_ENDPOINT,
      credentials: {
        accessKeyId: 'test',
        secretAccessKey: 'test',
      },
    });

    docClient = DynamoDBDocumentClient.from(client);
  }, 45000); // Increased from 15000ms to 45000ms to allow LocalStack setup

  // DeleteItem is idempotent (deleting a non-existent key is not an error),
  // so a failure here means the cleanup client can't reach DynamoDB at all -
  // that's worth surfacing instead of silently leaving stale test data behind.
  const deleteTestRecord = async () => {
    try {
      await docClient.send(
        new DeleteCommand({
          TableName: 'users_certificate',
          Key: { id: 'integration-test-123' },
        }),
      );
    } catch (error) {
      console.warn('Failed to clean up integration-test-123', error);
    }
  };

  beforeEach(deleteTestRecord);
  afterEach(deleteTestRecord);

  describe('Generate Certificate Flow', () => {
    it('should generate certificate and store in DynamoDB', async () => {
      const generateEvent: Partial<APIGatewayProxyEvent> = {
        headers: { 'x-api-key': process.env.API_KEY as string },
        body: JSON.stringify({
          id: 'integration-test-123',
          name: 'Integration Test User',
          grade: 'A+',
        }),
      };

      const result = await generateHandler(
        generateEvent as APIGatewayProxyEvent,
        mockContext,
        mockCallback,
      );

      expect(result).toBeDefined();
      expect((result as any).statusCode).toBe(201);

      const responseBody = JSON.parse((result as any).body);
      expect(responseBody.message).toBe('Certificate created successfully');
      expect(responseBody.url).toContain('integration-test-123.pdf');
    }, 30000);

    it('should verify generated certificate', async () => {
      // First generate a certificate
      const generateEvent: Partial<APIGatewayProxyEvent> = {
        headers: { 'x-api-key': process.env.API_KEY as string },
        body: JSON.stringify({
          id: 'integration-test-123',
          name: 'Integration Test User',
          grade: 'A+',
        }),
      };

      await generateHandler(generateEvent as APIGatewayProxyEvent, mockContext, mockCallback);

      // Then verify it
      const verifyEvent: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          id: 'integration-test-123',
        },
      };

      const result = await verifyHandler(
        verifyEvent as APIGatewayProxyEvent,
        mockContext,
        mockCallback,
      );

      expect(result).toBeDefined();
      expect((result as any).statusCode).toBe(200);

      const responseBody = JSON.parse((result as any).body);
      expect(responseBody.message).toBe('Valid certificate');
      expect(responseBody.name).toBe('Integration Test User');
      expect(responseBody.url).toContain('integration-test-123.pdf');
    }, 30000);

    it('should return invalid for non-existent certificate', async () => {
      const verifyEvent: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          id: 'non-existent-certificate',
        },
      };

      const result = await verifyHandler(
        verifyEvent as APIGatewayProxyEvent,
        mockContext,
        mockCallback,
      );

      expect(result).toBeDefined();
      expect((result as any).statusCode).toBe(404);

      const responseBody = JSON.parse((result as any).body);
      expect(responseBody.message).toBe('Certificate not found');
    }, 15000);
  });

  describe('Generate Certificate Edge Cases', () => {
    it('should not create duplicate entries for existing user', async () => {
      const generateEvent: Partial<APIGatewayProxyEvent> = {
        headers: { 'x-api-key': process.env.API_KEY as string },
        body: JSON.stringify({
          id: 'integration-test-123',
          name: 'Integration Test User',
          grade: 'A+',
        }),
      };

      // Generate certificate twice
      const result1 = await generateHandler(
        generateEvent as APIGatewayProxyEvent,
        mockContext,
        mockCallback,
      );

      const result2 = await generateHandler(
        generateEvent as APIGatewayProxyEvent,
        mockContext,
        mockCallback,
      );

      // First call creates it, second call reports it already exists (no duplicate write)
      expect((result1 as any).statusCode).toBe(201);
      expect((result2 as any).statusCode).toBe(200);
      expect(JSON.parse((result2 as any).body).message).toBe('Certificate already exists');

      // Verify the certificate exists and is valid
      const verifyEvent: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          id: 'integration-test-123',
        },
      };

      const verifyResult = await verifyHandler(
        verifyEvent as APIGatewayProxyEvent,
        mockContext,
        mockCallback,
      );

      expect((verifyResult as any).statusCode).toBe(200);
    }, 45000);
  });
});
