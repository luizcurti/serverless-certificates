plugin "terraform" {
  enabled = true
  preset  = "recommended"
}

plugin "aws" {
  enabled = true
  version = "0.40.0"
  source  = "github.com/terraform-linters/tflint-ruleset-aws"
}

# False positive: nodejs24.x is a real, GA Lambda runtime (confirmed via a
# real `terraform plan` against AWS), but ruleset-aws@0.40.0's static list of
# valid runtimes predates it. Revisit when the plugin is updated.
rule "aws_lambda_function_invalid_runtime" {
  enabled = false
}
