import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

// Global setup for integration tests. Existing env vars are respected
// (e.g. when run inside a container joined to the Docker Compose network,
// DYNAMODB_ENDPOINT/S3_ENDPOINT point at the "localstack" service name
// instead of localhost).
process.env.NODE_ENV = 'test';
process.env.IS_OFFLINE = 'true';
process.env.AWS_REGION ??= 'us-east-1';
process.env.DYNAMODB_ENDPOINT ??= 'http://localhost:4566';
process.env.S3_ENDPOINT ??= 'http://localhost:4566';
process.env.S3_BUCKET_NAME ??= 'certificadoignite2021';
process.env.API_KEY ??= 'test-api-key';

// Wait for LocalStack to be ready
const waitForLocalStack = async () => {
  const maxRetries = 15;
  let retries = 0;

  const client = new DynamoDBClient({
    region: process.env.AWS_REGION,
    endpoint: process.env.DYNAMODB_ENDPOINT,
    credentials: {
      accessKeyId: 'test',
      secretAccessKey: 'test',
    },
  });

  const docClient = DynamoDBDocumentClient.from(client);

  while (retries < maxRetries) {
    try {
      await docClient.send(
        new PutCommand({
          TableName: 'users_certificate',
          Item: { id: 'health-check', name: 'test' },
        }),
      );

      await docClient.send(
        new DeleteCommand({
          TableName: 'users_certificate',
          Key: { id: 'health-check' },
        }),
      );

      console.log('LocalStack is ready!');
      return;
    } catch {
      retries++;
      console.log(`Waiting for LocalStack... (${retries}/${maxRetries})`);
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Increased back to 2000ms
    }
  }

  throw new Error(
    'LocalStack is not ready after 30 seconds. Please start LocalStack with: yarn docker:up',
  );
};

export { waitForLocalStack };
