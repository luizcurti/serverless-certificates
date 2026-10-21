# HTTP API (API Gateway v2): simpler and cheaper than a REST API (v1) for a
# plain Lambda-proxy API like this one. payload_format_version "1.0" is used
# so Lambda still receives the classic APIGatewayProxyEvent shape the
# handlers are already written against (no code changes needed).
resource "aws_apigatewayv2_api" "this" {
  name          = "${var.project_name}-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "OPTIONS"]
    allow_headers = ["content-type", "x-api-key"]
  }
}

# Access logs (who called what, when, with what result) are separate from
# each Lambda's own execution logs, and retained independently.
resource "aws_cloudwatch_log_group" "api_access_logs" {
  name              = "/aws/apigateway/${var.project_name}-api"
  retention_in_days = var.log_retention_days
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = "$default"
  auto_deploy = true

  # Basic flood protection: without a per-route limit, an unauthenticated
  # burst of POST /generateCertificate requests (rejected only after
  # invoking the Lambda) could still rack up Lambda cost. verifyCertificate
  # is cheap (a single DynamoDB read) and is left uncapped by this default.
  default_route_settings {
    throttling_burst_limit = 20
    throttling_rate_limit  = 10
  }

  route_settings {
    route_key              = aws_apigatewayv2_route.generate_certificate.route_key
    throttling_burst_limit = 5
    throttling_rate_limit  = 2
  }

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_access_logs.arn
    format = jsonencode({
      requestId        = "$context.requestId"
      requestTime      = "$context.requestTime"
      httpMethod       = "$context.httpMethod"
      routeKey         = "$context.routeKey"
      status           = "$context.status"
      responseLength   = "$context.responseLength"
      integrationError = "$context.integrationErrorMessage"
      sourceIp         = "$context.identity.sourceIp"
    })
  }
}

resource "aws_apigatewayv2_integration" "generate_certificate" {
  api_id                 = aws_apigatewayv2_api.this.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.generate_certificate.invoke_arn
  payload_format_version = "1.0"
}

resource "aws_apigatewayv2_route" "generate_certificate" {
  api_id    = aws_apigatewayv2_api.this.id
  route_key = "POST /generateCertificate"
  target    = "integrations/${aws_apigatewayv2_integration.generate_certificate.id}"
}

resource "aws_lambda_permission" "generate_certificate_apigw" {
  statement_id  = "AllowAPIGatewayInvokeGenerate"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.generate_certificate.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/*/*"
}

resource "aws_apigatewayv2_integration" "verify_certificate" {
  api_id                 = aws_apigatewayv2_api.this.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.verify_certificate.invoke_arn
  payload_format_version = "1.0"
}

resource "aws_apigatewayv2_route" "verify_certificate" {
  api_id    = aws_apigatewayv2_api.this.id
  route_key = "GET /verifyCertificate/{id}"
  target    = "integrations/${aws_apigatewayv2_integration.verify_certificate.id}"
}

resource "aws_lambda_permission" "verify_certificate_apigw" {
  statement_id  = "AllowAPIGatewayInvokeVerify"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.verify_certificate.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/*/*"
}
