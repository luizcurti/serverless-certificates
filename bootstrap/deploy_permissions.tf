# Least-privilege-ish permissions for the deploy role: everything the stack in ../infra needs
# to create, update and destroy, scoped by the `${var.project_name}` name prefix wherever the
# service supports resource-level permissions.
#
# Unavoidably broader:
#   - API Gateway HTTP APIs are addressed by generated IDs, not names, so apigateway:* is
#     scoped to the region rather than the project.
#   - The aws/ssm KMS key is AWS-managed; access to it is limited to calls made through SSM.
#   - A handful of Describe/List calls only accept "*".

locals {
  p      = var.project_name
  region = var.aws_region
  acct   = local.account_id

  # The only AWS-managed policies the stack attaches (infra/lambda.tf). Restricting
  # attachments to these stops the deploy role from attaching e.g. AdministratorAccess to a
  # role it creates.
  attachable_managed_policies = [
    "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
    "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess",
  ]
}

data "aws_iam_policy_document" "deploy_permissions" {
  statement {
    sid       = "StateBucketList"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.tfstate.arn]
  }

  statement {
    sid       = "StateObjects"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.tfstate.arn}/*"]
  }

  # The public certificates bucket (<project>-certificates-<account id>) and the private
  # deployment-package bucket (<project>-lambda-deploy-<random>). Neither pattern matches the
  # state bucket (<project>-tfstate-<account id>).
  statement {
    sid     = "StackBuckets"
    actions = ["s3:*"]
    resources = [
      "arn:aws:s3:::${local.p}-certificates-*",
      "arn:aws:s3:::${local.p}-certificates-*/*",
      "arn:aws:s3:::${local.p}-lambda-deploy-*",
      "arn:aws:s3:::${local.p}-lambda-deploy-*/*",
    ]
  }

  statement {
    sid       = "LambdaFunctions"
    actions   = ["lambda:*"]
    resources = ["arn:aws:lambda:${local.region}:${local.acct}:function:${local.p}-*"]
  }

  statement {
    sid = "IamProjectRoles"
    actions = [
      "iam:CreateRole",
      "iam:DeleteRole",
      "iam:GetRole",
      "iam:UpdateRole",
      "iam:UpdateAssumeRolePolicy",
      "iam:TagRole",
      "iam:UntagRole",
      "iam:ListRoleTags",
      "iam:PutRolePolicy",
      "iam:GetRolePolicy",
      "iam:DeleteRolePolicy",
      "iam:ListRolePolicies",
      "iam:ListAttachedRolePolicies",
      "iam:ListInstanceProfilesForRole",
    ]
    resources = ["arn:aws:iam::${local.acct}:role/${local.p}-*"]
  }

  statement {
    sid       = "IamAttachStackManagedPoliciesOnly"
    actions   = ["iam:AttachRolePolicy", "iam:DetachRolePolicy"]
    resources = ["arn:aws:iam::${local.acct}:role/${local.p}-*"]

    condition {
      test     = "ArnEquals"
      variable = "iam:PolicyARN"
      values   = local.attachable_managed_policies
    }
  }

  statement {
    sid       = "IamPassProjectRolesToLambda"
    actions   = ["iam:PassRole"]
    resources = ["arn:aws:iam::${local.acct}:role/${local.p}-*"]

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["lambda.amazonaws.com"]
    }
  }

  # HTTP APIs create the API Gateway service-linked role on first use in an account.
  statement {
    sid       = "ApiGatewayServiceLinkedRole"
    actions   = ["iam:CreateServiceLinkedRole"]
    resources = ["arn:aws:iam::${local.acct}:role/aws-service-role/ops.apigateway.amazonaws.com/*"]

    condition {
      test     = "StringEquals"
      variable = "iam:AWSServiceName"
      values   = ["ops.apigateway.amazonaws.com"]
    }
  }

  statement {
    sid = "ApiGateway"
    actions = [
      "apigateway:GET",
      "apigateway:POST",
      "apigateway:PUT",
      "apigateway:PATCH",
      "apigateway:DELETE",
      "apigateway:TagResource",
      "apigateway:UntagResource",
    ]
    resources = ["arn:aws:apigateway:${local.region}::/*"]
  }

  statement {
    sid     = "DynamoDb"
    actions = ["dynamodb:*"]
    resources = [
      "arn:aws:dynamodb:${local.region}:${local.acct}:table/${local.p}-*",
      "arn:aws:dynamodb:${local.region}:${local.acct}:table/${local.p}-*/index/*",
    ]
  }

  statement {
    sid       = "SsmApiKeyParameter"
    actions   = ["ssm:*"]
    resources = ["arn:aws:ssm:${local.region}:${local.acct}:parameter/${local.p}/*"]
  }

  # SecureString with the AWS-managed aws/ssm key: Terraform writes and reads the value back,
  # so it needs the key, but only through SSM.
  statement {
    sid       = "SsmKmsViaSsmOnly"
    actions   = ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey", "kms:DescribeKey"]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["ssm.${local.region}.amazonaws.com"]
    }
  }

  statement {
    sid     = "LogGroups"
    actions = ["logs:*"]
    resources = [
      "arn:aws:logs:${local.region}:${local.acct}:log-group:/aws/lambda/${local.p}-*",
      "arn:aws:logs:${local.region}:${local.acct}:log-group:/aws/apigateway/${local.p}-*",
    ]
  }

  statement {
    sid       = "Alarms"
    actions   = ["cloudwatch:*"]
    resources = ["arn:aws:cloudwatch:${local.region}:${local.acct}:alarm:${local.p}-*"]
  }

  # Only used when budget_alert_email is set (infra/observability.tf).
  statement {
    sid       = "Budget"
    actions   = ["budgets:*"]
    resources = ["arn:aws:budgets::${local.acct}:budget/${local.p}-*"]
  }

  statement {
    sid = "AccountWideReadsAndLogDelivery"
    actions = [
      "sts:GetCallerIdentity",
      "cloudwatch:DescribeAlarms",
      "logs:DescribeLogGroups",
      "logs:DescribeResourcePolicies",
      "logs:PutResourcePolicy",
      "logs:CreateLogDelivery",
      "logs:GetLogDelivery",
      "logs:UpdateLogDelivery",
      "logs:DeleteLogDelivery",
      "logs:ListLogDeliveries",
      "lambda:GetAccountSettings",
      "ssm:DescribeParameters",
      "iam:GetPolicy",
      "iam:GetPolicyVersion",
    ]
    resources = ["*"]
  }

  # The deploy role matches the `${var.project_name}-*` prefix itself; never let it rewrite its
  # own trust or permissions.
  statement {
    sid    = "DenySelfModification"
    effect = "Deny"
    actions = [
      "iam:UpdateRole",
      "iam:UpdateAssumeRolePolicy",
      "iam:PutRolePolicy",
      "iam:DeleteRolePolicy",
      "iam:AttachRolePolicy",
      "iam:DetachRolePolicy",
      "iam:DeleteRole",
      "iam:TagRole",
      "iam:UntagRole",
    ]
    resources = [aws_iam_role.github_deploy.arn]
  }
}
