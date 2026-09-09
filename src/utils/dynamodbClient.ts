import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const createDynamoDBClient = () => {
  const isOffline = process.env.IS_OFFLINE;
  const endpoint = process.env.DYNAMODB_ENDPOINT || 'http://localhost:4566';

  const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'eu-west-1',
    ...(isOffline && {
      endpoint,
      credentials: {
        accessKeyId: 'test',
        secretAccessKey: 'test',
      },
    }),
  });

  return DynamoDBDocumentClient.from(client);
};

export const document = createDynamoDBClient();
