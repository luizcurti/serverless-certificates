#!/bin/bash

echo "Initializing LocalStack resources..."

# Wait for LocalStack to be ready
echo "Waiting for localstack to be ready..."
until awslocal dynamodb list-tables; do
  echo "Waiting for DynamoDB to be ready..."
  sleep 2
done

# Create DynamoDB table
echo "Creating DynamoDB table..."
awslocal dynamodb create-table \
    --table-name users_certificate \
    --attribute-definitions \
        AttributeName=id,AttributeType=S \
    --key-schema \
        AttributeName=id,KeyType=HASH \
    --provisioned-throughput \
        ReadCapacityUnits=5,WriteCapacityUnits=5 \
    --region us-east-1

# Create S3 bucket
echo "Creating S3 bucket..."
awslocal s3 mb s3://certificadoignite2021 --region us-east-1

# Set S3 bucket policy for public read
echo "Setting S3 bucket policy..."
awslocal s3api put-bucket-policy \
    --bucket certificadoignite2021 \
    --policy '{
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "PublicReadGetObject",
                "Effect": "Allow",
                "Principal": "*",
                "Action": "s3:GetObject",
                "Resource": "arn:aws:s3:::certificadoignite2021/*"
            }
        ]
    }'

echo "LocalStack resources initialized successfully!"