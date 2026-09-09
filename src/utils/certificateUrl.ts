export const certificateUrl = (bucket: string, id: string) =>
  `https://${bucket}.s3.amazonaws.com/${id}.pdf`;
