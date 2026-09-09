import { APIGatewayProxyHandler } from 'aws-lambda';
import { document } from '../utils/dynamodbClient';
import { certificateUrl } from '../utils/certificateUrl';
import { logError, logInfo } from '../utils/logger';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ICertificateRecord } from '../types';

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME ?? 'users_certificate';

export const handler: APIGatewayProxyHandler = async (event) => {
  const requestId = event.requestContext?.requestId;

  if (!event.pathParameters?.id) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: 'Certificate ID is required',
      }),
    };
  }

  const { id } = event.pathParameters;

  try {
    const bucket = process.env.S3_BUCKET_NAME;
    if (!bucket) {
      throw new Error('S3_BUCKET_NAME is not set');
    }

    const response = await document.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));

    const userCertificate = response.Item as ICertificateRecord | undefined;

    if (userCertificate) {
      logInfo('Certificate verified', { requestId, id });
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Valid certificate',
          name: userCertificate.name,
          url: certificateUrl(bucket, id),
        }),
      };
    }

    logInfo('Certificate not found', { requestId, id });
    return {
      statusCode: 404,
      body: JSON.stringify({
        message: 'Certificate not found',
      }),
    };
  } catch (error) {
    logError('Failed to verify certificate', error, { requestId, id });
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
};
