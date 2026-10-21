/**
 * Minimal HTTP adapter that exposes the Lambda handlers over plain HTTP.
 * Used both for local development (`yarn dev`) and for the Postman/Newman
 * API collection tests (`yarn test:api`).
 *
 * The Serverless Framework's `serverless offline` is intentionally not used:
 * Framework v4 requires an interactive login / license key even for fully
 * local runs, which this project avoids entirely by deploying with
 * Terraform and running locally with this plain adapter instead.
 */
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { handler as generateCertificate } from '../src/functions/generateCertificate';
import { handler as verifyCertificate } from '../src/functions/verifyCertificate';

const PORT = Number(process.env.PORT ?? process.env.API_TEST_PORT ?? 3000);

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });

const noopContext = {} as Context;
const noopCallback = () => undefined;

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  try {
    if (req.method === 'POST' && url.pathname === '/generateCertificate') {
      const body = await readBody(req);
      const headers = Object.fromEntries(
        Object.entries(req.headers).map(([key, value]) => [
          key,
          Array.isArray(value) ? value[0] : value,
        ]),
      );
      const event = { body, headers } as unknown as APIGatewayProxyEvent;
      const result = await generateCertificate(event, noopContext, noopCallback);
      res.writeHead(result?.statusCode ?? 500, { 'Content-Type': 'application/json' });
      res.end(result?.body);
      return;
    }

    const verifyMatch = url.pathname.match(/^\/verifyCertificate\/(.+)$/);
    if (req.method === 'GET' && verifyMatch) {
      const event = {
        pathParameters: { id: decodeURIComponent(verifyMatch[1]) },
      } as unknown as APIGatewayProxyEvent;
      const result = await verifyCertificate(event, noopContext, noopCallback);
      res.writeHead(result?.statusCode ?? 500, { 'Content-Type': 'application/json' });
      res.end(result?.body);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Route not found' }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Internal server error', error: String(error) }));
  }
});

server.listen(PORT, () => {
  console.log(`Local server listening on http://localhost:${PORT}`);
});
