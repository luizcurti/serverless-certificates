# Public bucket that stores the generated certificate PDFs - the API
# returns direct https://<bucket>.s3.amazonaws.com/<id>.pdf URLs, so the
# objects need to be publicly readable.
resource "aws_s3_bucket" "certificates" {
  bucket = var.certificate_bucket_name
}

resource "aws_s3_bucket_public_access_block" "certificates" {
  bucket = aws_s3_bucket.certificates.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "certificates_public_read" {
  bucket = aws_s3_bucket.certificates.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.certificates.arn}/*"
      }
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.certificates]
}

# Separate, private bucket for Lambda deployment packages. Kept apart from
# the certificates bucket above so the public-read policy never applies to
# the function source code.
resource "aws_s3_bucket" "lambda_deployments" {
  bucket_prefix = "${var.project_name}-lambda-deploy-"
}

resource "aws_s3_bucket_public_access_block" "lambda_deployments" {
  bucket                  = aws_s3_bucket.lambda_deployments.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
