terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.21"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Local state by default (terraform.tfstate, gitignored) - simplest option
  # for a single-developer/small-team project. For shared/team use, add an
  # S3 backend block here (with a separate bootstrap step for the state
  # bucket + a DynamoDB lock table).
}

provider "aws" {
  region = var.aws_region
}
