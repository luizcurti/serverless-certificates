terraform {
  required_version = ">= 1.10"

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

  # No backend block on purpose: local runs use local state
  # (infra/terraform.tfstate, gitignored). The CI-CD deploy and Destroy
  # workflows write infra/ci_backend.tf with `backend "s3" {}` right before
  # `terraform init`, pointing at the bucket created by ../bootstrap (native
  # S3 locking via use_lockfile, hence >= 1.10).
}

provider "aws" {
  region = var.aws_region
}
