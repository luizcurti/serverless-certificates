import { certificateUrl } from '../../src/utils/certificateUrl';

describe('certificateUrl', () => {
  const originalRegion = process.env.AWS_REGION;

  afterEach(() => {
    process.env.AWS_REGION = originalRegion;
  });

  it('builds a regional S3 URL from AWS_REGION', () => {
    process.env.AWS_REGION = 'eu-west-2';
    expect(certificateUrl('my-bucket', 'abc')).toBe(
      'https://my-bucket.s3.eu-west-2.amazonaws.com/abc.pdf',
    );
  });

  it('falls back to eu-west-1 when AWS_REGION is not set', () => {
    delete process.env.AWS_REGION;
    expect(certificateUrl('my-bucket', 'abc')).toBe(
      'https://my-bucket.s3.eu-west-1.amazonaws.com/abc.pdf',
    );
  });

  it('accepts an explicit region', () => {
    expect(certificateUrl('my-bucket', 'abc', 'us-east-1')).toBe(
      'https://my-bucket.s3.us-east-1.amazonaws.com/abc.pdf',
    );
  });
});
