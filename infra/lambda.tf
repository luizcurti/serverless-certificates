data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# One role per function (not a shared "do everything" role): each Lambda
# gets only the permissions its own handler code actually calls.
resource "aws_iam_role" "generate_certificate" {
  name               = "${var.project_name}-generateCertificate"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role" "verify_certificate" {
  name               = "${var.project_name}-verifyCertificate"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role_policy_attachment" "generate_certificate_basic_execution" {
  role       = aws_iam_role.generate_certificate.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "verify_certificate_basic_execution" {
  role       = aws_iam_role.verify_certificate.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# X-Ray: a request crosses API Gateway -> Lambda -> DynamoDB/S3, so tracing
# is worth the (free-tier eligible) cost. AWS's own managed policy covers
# the write permissions the X-Ray SDK/agent needs - no custom policy needed.
resource "aws_iam_role_policy_attachment" "generate_certificate_xray" {
  role       = aws_iam_role.generate_certificate.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

resource "aws_iam_role_policy_attachment" "verify_certificate_xray" {
  role       = aws_iam_role.verify_certificate.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

# generateCertificate: reads/writes the table (GetItem on conflict,
# conditional PutItem) and uploads the rendered PDF to S3, plus reads its
# own API key out of SSM.
data "aws_iam_policy_document" "generate_certificate_permissions" {
  statement {
    sid       = "DynamoDbAccess"
    effect    = "Allow"
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem"]
    resources = [aws_dynamodb_table.users_certificate.arn]
  }

  statement {
    sid       = "S3CertificateAccess"
    effect    = "Allow"
    actions   = ["s3:PutObject", "s3:GetObject"]
    resources = ["${aws_s3_bucket.certificates.arn}/*"]
  }

  statement {
    sid       = "ReadApiKey"
    effect    = "Allow"
    actions   = ["ssm:GetParameter"]
    resources = [aws_ssm_parameter.generate_certificate_api_key.arn]
  }

  statement {
    sid       = "DecryptApiKey"
    effect    = "Allow"
    actions   = ["kms:Decrypt"]
    resources = ["arn:aws:kms:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:alias/aws/ssm"]
  }
}

resource "aws_iam_role_policy" "generate_certificate_permissions" {
  name   = "${var.project_name}-generateCertificate-permissions"
  role   = aws_iam_role.generate_certificate.id
  policy = data.aws_iam_policy_document.generate_certificate_permissions.json
}

# verifyCertificate: only ever reads the table by key - it never touches S3
# (the download URL is built from the id, not read from the bucket).
data "aws_iam_policy_document" "verify_certificate_permissions" {
  statement {
    sid       = "DynamoDbAccess"
    effect    = "Allow"
    actions   = ["dynamodb:GetItem"]
    resources = [aws_dynamodb_table.users_certificate.arn]
  }
}

resource "aws_iam_role_policy" "verify_certificate_permissions" {
  name   = "${var.project_name}-verifyCertificate-permissions"
  role   = aws_iam_role.verify_certificate.id
  policy = data.aws_iam_policy_document.verify_certificate_permissions.json
}

resource "aws_cloudwatch_log_group" "generate_certificate" {
  name              = "/aws/lambda/${var.project_name}-generateCertificate"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "verify_certificate" {
  name              = "/aws/lambda/${var.project_name}-verifyCertificate"
  retention_in_days = var.log_retention_days
}

# Deployment packages are built by `yarn build:lambda` (scripts/build-lambda.js)
# into infra/build/<function>/ before `terraform apply`.
data "archive_file" "generate_certificate" {
  type        = "zip"
  source_dir  = "${path.module}/build/generateCertificate"
  output_path = "${path.module}/build/generateCertificate.zip"
}

data "archive_file" "verify_certificate" {
  type        = "zip"
  source_dir  = "${path.module}/build/verifyCertificate"
  output_path = "${path.module}/build/verifyCertificate.zip"
}

resource "aws_s3_object" "generate_certificate_package" {
  bucket = aws_s3_bucket.lambda_deployments.id
  key    = "generateCertificate/${data.archive_file.generate_certificate.output_md5}.zip"
  source = data.archive_file.generate_certificate.output_path
  etag   = data.archive_file.generate_certificate.output_md5
}

resource "aws_s3_object" "verify_certificate_package" {
  bucket = aws_s3_bucket.lambda_deployments.id
  key    = "verifyCertificate/${data.archive_file.verify_certificate.output_md5}.zip"
  source = data.archive_file.verify_certificate.output_path
  etag   = data.archive_file.verify_certificate.output_md5
}

locals {
  common_lambda_environment = {
    AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1"
    NODE_OPTIONS                        = "--enable-source-maps --stack-trace-limit=1000"
    S3_BUCKET_NAME                      = aws_s3_bucket.certificates.bucket
    DYNAMODB_TABLE_NAME                 = aws_dynamodb_table.users_certificate.name
  }
}

# Random value for the `x-api-key` header POST /generateCertificate requires.
# Stored in SSM (SecureString) rather than passed as a plaintext Lambda env
# var, so it isn't visible in the Lambda console/API to anyone who can read
# function configuration. Generated here so a working key exists on first
# apply with no manual setup; retrieve it with
# `terraform output -raw generate_certificate_api_key`.
resource "random_password" "generate_certificate_api_key" {
  length  = 32
  special = false
}

resource "aws_ssm_parameter" "generate_certificate_api_key" {
  name  = "/${var.project_name}/generateCertificate/apiKey"
  type  = "SecureString"
  value = random_password.generate_certificate_api_key.result
}

resource "aws_lambda_function" "generate_certificate" {
  function_name = "${var.project_name}-generateCertificate"
  role          = aws_iam_role.generate_certificate.arn
  handler       = "index.handler"
  runtime       = "nodejs24.x"
  timeout       = var.generate_certificate_timeout
  memory_size   = var.lambda_memory_size

  # Caps worst-case concurrent Chromium renders (the expensive path) so a
  # traffic spike can't exhaust the account's Lambda concurrency and starve
  # verifyCertificate. Works together with the API Gateway throttling on
  # this route (see apigateway.tf).
  reserved_concurrent_executions = var.generate_certificate_reserved_concurrency

  s3_bucket        = aws_s3_bucket.lambda_deployments.id
  s3_key           = aws_s3_object.generate_certificate_package.key
  source_code_hash = data.archive_file.generate_certificate.output_base64sha256

  tracing_config {
    mode = "Active"
  }

  environment {
    variables = merge(local.common_lambda_environment, {
      API_KEY_PARAMETER_NAME = aws_ssm_parameter.generate_certificate_api_key.name
    })
  }

  depends_on = [aws_cloudwatch_log_group.generate_certificate]
}

resource "aws_lambda_function" "verify_certificate" {
  function_name = "${var.project_name}-verifyCertificate"
  role          = aws_iam_role.verify_certificate.arn
  handler       = "index.handler"
  runtime       = "nodejs24.x"
  timeout       = var.verify_certificate_timeout
  memory_size   = var.lambda_memory_size

  s3_bucket        = aws_s3_bucket.lambda_deployments.id
  s3_key           = aws_s3_object.verify_certificate_package.key
  source_code_hash = data.archive_file.verify_certificate.output_base64sha256

  tracing_config {
    mode = "Active"
  }

  environment {
    variables = local.common_lambda_environment
  }

  depends_on = [aws_cloudwatch_log_group.verify_certificate]
}
