// Regional virtual-hosted URL: the global `<bucket>.s3.amazonaws.com` endpoint
// answers 307 (redirect to the regional one) for buckets outside us-east-1
// until DNS propagates, which can take hours after the bucket is created.
export const certificateUrl = (
  bucket: string,
  id: string,
  region: string = process.env.AWS_REGION || 'eu-west-1',
) => `https://${bucket}.s3.${region}.amazonaws.com/${id}.pdf`;
