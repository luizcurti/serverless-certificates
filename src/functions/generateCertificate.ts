import { APIGatewayProxyHandler } from 'aws-lambda';
import { document } from '../utils/dynamodbClient';
import { certificateUrl } from '../utils/certificateUrl';
import { logError, logInfo } from '../utils/logger';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { compile } from 'handlebars';
import dayjs from 'dayjs';
import { join } from 'path';
import { readFileSync } from 'fs';
import { timingSafeEqual } from 'crypto';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { ICertificateRecord } from '../types';

interface ICreateCertificateBody {
  id: string;
  name: string;
  grade: string;
}

interface ITemplate {
  id: string;
  name: string;
  grade: string;
  medal: string;
  date: string;
}

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME ?? 'users_certificate';

// Used as the S3 object key (`${id}.pdf`) - kept restrictive so it can never
// be read as a path (e.g. containing "/" or "..").
const ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const MAX_TEXT_LENGTH = 100;

const isValidApiKey = (provided: string | undefined, expected: string | undefined): boolean => {
  if (!provided || !expected) {
    return false;
  }

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  // timingSafeEqual throws on mismatched lengths, so short-circuit first -
  // this leaks key length via timing, not the key itself, which is an
  // accepted trade-off for a timing-safe comparison.
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
};

let cachedApiKey: string | undefined;

// In AWS, the key lives in SSM (SecureString) rather than a plaintext Lambda
// env var - see infra/lambda.tf. Local/CI dev has no SSM to talk to, so it
// falls back to a plain API_KEY env var, matching how S3_ENDPOINT/DYNAMODB_ENDPOINT
// already branch on IS_OFFLINE elsewhere in this codebase.
const getExpectedApiKey = async (): Promise<string | undefined> => {
  if (cachedApiKey) {
    return cachedApiKey;
  }

  if (process.env.IS_OFFLINE) {
    cachedApiKey = process.env.API_KEY;
    return cachedApiKey;
  }

  const parameterName = process.env.API_KEY_PARAMETER_NAME;
  if (!parameterName) {
    return undefined;
  }

  const ssm = new SSMClient({ region: process.env.AWS_REGION || 'eu-west-1' });
  const result = await ssm.send(
    new GetParameterCommand({ Name: parameterName, WithDecryption: true }),
  );
  cachedApiKey = result.Parameter?.Value;
  return cachedApiKey;
};

const compileTemplate = async (data: ITemplate) => {
  const filePath = join(process.cwd(), 'src', 'templates', 'certificate.hbs');

  const html = readFileSync(filePath, 'utf8');

  return compile(html)(data);
};

const createS3Client = () => {
  const isOffline = process.env.IS_OFFLINE;
  const endpoint = process.env.S3_ENDPOINT || 'http://localhost:4566';

  return new S3Client({
    region: process.env.AWS_REGION || 'eu-west-1',
    ...(isOffline && {
      endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: 'test',
        secretAccessKey: 'test',
      },
    }),
  });
};

export const handler: APIGatewayProxyHandler = async (event) => {
  const requestId = event.requestContext?.requestId;

  let expectedApiKey: string | undefined;
  try {
    expectedApiKey = await getExpectedApiKey();
  } catch (error) {
    logError('Failed to load API key', error, { requestId });
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }

  if (!isValidApiKey(event.headers?.['x-api-key'], expectedApiKey)) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: 'Invalid or missing API key' }),
    };
  }

  if (!event.body) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: 'Request body is required',
      }),
    };
  }

  let parsed: ICreateCertificateBody;
  try {
    parsed = JSON.parse(event.body) as ICreateCertificateBody;
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Invalid JSON in request body' }),
    };
  }

  const { id, name, grade } = parsed;

  if (!id || !name || !grade) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'id, name and grade are required' }),
    };
  }

  if (!ID_PATTERN.test(id)) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: 'id must contain only letters, numbers, "_" and "-", up to 64 characters',
      }),
    };
  }

  if (name.length > MAX_TEXT_LENGTH || grade.length > MAX_TEXT_LENGTH) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: `name and grade must be at most ${MAX_TEXT_LENGTH} characters`,
      }),
    };
  }

  try {
    const bucket = process.env.S3_BUCKET_NAME;
    if (!bucket) {
      throw new Error('S3_BUCKET_NAME is not set');
    }

    try {
      await document.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            id,
            name,
            grade,
            created_at: Date.now(),
          } satisfies ICertificateRecord,
          ConditionExpression: 'attribute_not_exists(id)',
        }),
      );
    } catch (error) {
      if (!(error instanceof ConditionalCheckFailedException)) {
        throw error;
      }

      // Another request already created this id (or it was created earlier) -
      // don't overwrite it or re-render/re-upload the PDF, just report it back.
      const existing = await document.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));
      const record = existing.Item as ICertificateRecord | undefined;

      logInfo('Certificate already exists', { requestId, id });

      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Certificate already exists',
          name: record?.name ?? name,
          url: certificateUrl(bucket, id),
        }),
      };
    }

    try {
      const medalPath = join(process.cwd(), 'src', 'templates', 'stamp.png');
      const medal = readFileSync(medalPath, 'base64');

      const data: ITemplate = {
        id,
        name,
        grade,
        date: dayjs().format('DD/MM/YYYY'),
        medal,
      };

      const content = await compileTemplate(data);

      const browser = await puppeteer.launch({
        args: chromium.args,
        executablePath: await chromium.executablePath(),
        headless: true,
      });

      let pdf!: Buffer;
      try {
        const page = await browser.newPage();
        await page.setContent(content);
        const pdfBytes = await page.pdf({
          format: 'a4',
          landscape: true,
          printBackground: true,
          preferCSSPageSize: true,
        });
        pdf = Buffer.from(pdfBytes);
      } finally {
        await browser.close();
      }

      const s3 = createS3Client();

      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: `${id}.pdf`,
          Body: pdf,
          ContentType: 'application/pdf',
        }),
      );

      logInfo('Certificate created', { requestId, id });

      return {
        statusCode: 201,
        body: JSON.stringify({
          message: 'Certificate created successfully',
          url: certificateUrl(bucket, id),
        }),
      };
    } catch (error) {
      // The DynamoDB record was already reserved above (attribute_not_exists),
      // so nothing else could have created it - it's safe to remove and let a
      // retry regenerate the PDF, instead of leaving a permanently "valid"
      // record with no matching S3 object.
      try {
        await document.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { id } }));
      } catch (rollbackError) {
        logError('Failed to roll back certificate reservation', rollbackError, {
          requestId,
          id,
        });
      }
      throw error;
    }
  } catch (error) {
    logError('Failed to generate certificate', error, { requestId, id });
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
};
