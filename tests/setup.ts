// Global test setup
process.env.NODE_ENV = 'test';
process.env.IS_OFFLINE = 'true';
process.env.AWS_REGION = 'us-east-1';
process.env.DYNAMODB_ENDPOINT = 'http://localhost:4566';
process.env.S3_ENDPOINT = 'http://localhost:4566';
process.env.S3_BUCKET_NAME = 'certificadoignite2021';
process.env.API_KEY = 'test-api-key';

// Mock AWS SDK v3
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb');
jest.mock('@aws-sdk/client-s3');
