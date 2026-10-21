variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "eu-west-1"
}

variable "project_name" {
  description = "Prefix used for naming AWS resources"
  type        = string
  default     = "ignitecertificate"
}

variable "certificate_bucket_name" {
  description = "S3 bucket name for storing generated certificate PDFs. null (the default) derives a globally unique name: <project_name>-certificates-<account id>."
  type        = string
  default     = null
}

variable "dynamodb_table_name" {
  description = "DynamoDB table name for certificate records. null (the default) uses <project_name>-users-certificate, so the CI/CD deploy role (scoped by the project_name prefix) can manage it."
  type        = string
  default     = null
}

variable "lambda_memory_size" {
  description = "Memory (MB) allocated to both Lambda functions. Headless Chromium (used by generateCertificate) needs at least 512MB."
  type        = number
  default     = 1024
}

variable "generate_certificate_timeout" {
  description = "Timeout (seconds) for generateCertificate (PDF rendering can be slow on a cold start)"
  type        = number
  default     = 30
}

variable "verify_certificate_timeout" {
  description = "Timeout (seconds) for verifyCertificate"
  type        = number
  default     = 6
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention for both functions"
  type        = number
  default     = 14
}

variable "generate_certificate_reserved_concurrency" {
  description = "Reserved concurrent executions for generateCertificate, capping worst-case cost/account-concurrency usage from the Chromium rendering path. Only applied when reserve_lambda_concurrency is true."
  type        = number
  default     = 5
}

variable "reserve_lambda_concurrency" {
  description = "Whether to apply generate_certificate_reserved_concurrency. Set false on accounts with the default 10-execution concurrency quota, where AWS doesn't allow reserving any (it must keep 10 unreserved)."
  type        = bool
  default     = true
}

variable "budget_alert_email" {
  description = "Email address to notify when the monthly cost budget is exceeded. Leave empty to skip creating the budget alarm."
  type        = string
  default     = ""
}
