data "aws_caller_identity" "current" {}

data "aws_region" "current" {}

locals {
  certificate_bucket_name = coalesce(var.certificate_bucket_name, "${var.project_name}-certificates-${data.aws_caller_identity.current.account_id}")
  dynamodb_table_name     = coalesce(var.dynamodb_table_name, "${var.project_name}-users-certificate")
}
