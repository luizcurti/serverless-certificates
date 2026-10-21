# CloudWatch alarms for both Lambdas and the API. No alarm_actions are wired
# up (no SNS topic/email is configured) - they're visible in the CloudWatch
# console/API today; add an SNS topic subscription later if on-call
# notification is actually needed.

resource "aws_cloudwatch_metric_alarm" "generate_certificate_errors" {
  alarm_name          = "${var.project_name}-generateCertificate-errors"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = aws_lambda_function.generate_certificate.function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
}

resource "aws_cloudwatch_metric_alarm" "generate_certificate_throttles" {
  alarm_name          = "${var.project_name}-generateCertificate-throttles"
  namespace           = "AWS/Lambda"
  metric_name         = "Throttles"
  dimensions          = { FunctionName = aws_lambda_function.generate_certificate.function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
}

resource "aws_cloudwatch_metric_alarm" "generate_certificate_duration" {
  alarm_name         = "${var.project_name}-generateCertificate-duration"
  namespace          = "AWS/Lambda"
  metric_name        = "Duration"
  dimensions         = { FunctionName = aws_lambda_function.generate_certificate.function_name }
  extended_statistic = "p95"
  period             = 300
  evaluation_periods = 1
  # 80% of the configured timeout - a proxy for "getting close to timing out".
  threshold           = var.generate_certificate_timeout * 1000 * 0.8
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
}

resource "aws_cloudwatch_metric_alarm" "verify_certificate_errors" {
  alarm_name          = "${var.project_name}-verifyCertificate-errors"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = aws_lambda_function.verify_certificate.function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
}

resource "aws_cloudwatch_metric_alarm" "verify_certificate_throttles" {
  alarm_name          = "${var.project_name}-verifyCertificate-throttles"
  namespace           = "AWS/Lambda"
  metric_name         = "Throttles"
  dimensions          = { FunctionName = aws_lambda_function.verify_certificate.function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
}

resource "aws_cloudwatch_metric_alarm" "verify_certificate_duration" {
  alarm_name          = "${var.project_name}-verifyCertificate-duration"
  namespace           = "AWS/Lambda"
  metric_name         = "Duration"
  dimensions          = { FunctionName = aws_lambda_function.verify_certificate.function_name }
  extended_statistic  = "p95"
  period              = 300
  evaluation_periods  = 1
  threshold           = var.verify_certificate_timeout * 1000 * 0.8
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
}

resource "aws_cloudwatch_metric_alarm" "api_4xx" {
  alarm_name          = "${var.project_name}-api-4xx"
  namespace           = "AWS/ApiGateway"
  metric_name         = "4xx"
  dimensions          = { ApiId = aws_apigatewayv2_api.this.id }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 10
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
}

resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  alarm_name          = "${var.project_name}-api-5xx"
  namespace           = "AWS/ApiGateway"
  metric_name         = "5xx"
  dimensions          = { ApiId = aws_apigatewayv2_api.this.id }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
}

# Optional: only created when an email is supplied, since a budget alarm
# with nowhere to send its notification isn't useful.
resource "aws_budgets_budget" "monthly_cost" {
  count = var.budget_alert_email != "" ? 1 : 0

  name         = "${var.project_name}-monthly-cost"
  budget_type  = "COST"
  limit_amount = "10"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.budget_alert_email]
  }
}
