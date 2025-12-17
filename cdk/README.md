# OversightML Tile Server - CDK Deployment Guide

This directory contains the AWS Cloud Development Kit (CDK) infrastructure code for deploying the OversightML Tile Server to AWS. The CDK application automates the creation of all required AWS resources including networking, compute, storage, and testing infrastructure.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Integration Testing](#integration-testing)
- [Cleanup](#cleanup)
- [Troubleshooting](#troubleshooting)
- [Development](#development)

## Overview

The Tile Server CDK application deploys a production-ready, serverless architecture on AWS that provides:

- **RESTful API**: OGC-compliant tile server API for accessing imagery
- **Scalable Compute**: ECS Fargate for auto-scaling container workloads
- **Persistent Storage**: DynamoDB for metadata, S3 for tiles and imagery
- **Asynchronous Processing**: SQS queues for background job processing
- **Network Isolation**: VPC with public/private subnets and security groups
- **Integration Testing**: Automated testing infrastructure with Lambda functions

## Architecture

The CDK application creates three CloudFormation stacks:

### 1. Network Stack (`OversightML-TileServerNetwork`)

Creates or imports networking resources:

- **VPC**: Virtual Private Cloud with public and private subnets across multiple availability zones
- **NAT Gateways**: For private subnet internet access
- **Security Groups**: Firewall rules for the tile server
- **VPC Endpoints**: For secure AWS service access (optional)

**Note**: You can either create a new VPC or import an existing one via configuration.

### 2. Tile Server Stack (`OversightML-TileServer`)

Deploys the core application infrastructure:

**Compute:**

- ECS Fargate cluster and service
- Application Load Balancer (ALB)
- Auto-scaling policies based on CPU/memory

**Storage:**

- DynamoDB tables for viewpoint metadata
- S3 buckets for tile cache and temporary storage
- SQS queues for asynchronous processing

**Security:**

- IAM roles and policies for ECS tasks
- Service-to-service permissions

### 3. Test Stack (`OversightML-TileServerTest`) - Optional

Deploys integration testing infrastructure:

- **Lambda Function**: Executes automated tests against the deployed tile server
- **Test Imagery**: S3 bucket with sample images for testing
- **IAM Roles**: Permissions for test execution

## Prerequisites

Before deploying, ensure you have:

### Required Tools

1. **Node.js** (Recent LTS version recommended)

   ```bash
   node --version
   ```

2. **AWS CLI** (v2 or later)

   ```bash
   aws --version
   ```

3. **AWS CDK** (v2 or later)

   ```bash
   npm install -g aws-cdk
   cdk --version
   ```

4. **Docker** (for building container images)
   ```bash
   docker --version
   ```

### AWS Account Setup

1. **AWS Account**: Active AWS account with appropriate permissions
2. **AWS Credentials**: Configured AWS credentials with permissions to:
   - Create/manage VPCs, subnets, security groups
   - Create/manage ECS clusters, services, and task definitions
   - Create/manage IAM roles and policies
   - Create/manage DynamoDB tables
   - Create/manage S3 buckets
   - Create/manage Application Load Balancers
   - Create/manage Lambda functions
   - Deploy CloudFormation stacks

3. **CDK Bootstrap**: Your AWS account and region must be bootstrapped for CDK:
   ```bash
   cdk bootstrap aws://ACCOUNT-ID/REGION
   ```

## Configuration

### 1. Install Dependencies

Navigate to the `cdk` directory and install dependencies:

```bash
cd cdk
npm install
```

### 2. Create Deployment Configuration

Copy the example configuration file:

```bash
cp bin/deployment/deployment.json.example bin/deployment/deployment.json
```

### 3. Configure deployment.json

Edit `bin/deployment/deployment.json` with your deployment settings:

#### Minimal Configuration

```json
{
  "projectName": "OversightML",
  "account": {
    "id": "123456789012",
    "region": "us-west-2",
    "prodLike": false,
    "isAdc": false
  }
}
```

#### Configuration Options

| Field              | Type    | Required | Description                                         |
| ------------------ | ------- | -------- | --------------------------------------------------- |
| `projectName`      | string  | Yes      | Logical name used as prefix for stack names         |
| `account.id`       | string  | Yes      | Your 12-digit AWS account ID                        |
| `account.region`   | string  | Yes      | AWS region for deployment (e.g., "us-west-2")       |
| `account.prodLike` | boolean | Yes      | Enable termination protection for production        |
| `account.isAdc`    | boolean | No       | Whether this is an ADC environment (default: false) |

#### Advanced Configuration

##### Network Configuration (Optional)

To use an existing VPC instead of creating a new one:

```json
{
  "projectName": "OversightML",
  "account": { "..." },
  "networkConfig": {
    "VPC_ID": "vpc-0123456789abcdef0",
    "TARGET_SUBNETS": [
      "subnet-0123456789abcdef0",
      "subnet-0123456789abcdef1"
    ],
    "SECURITY_GROUP_ID": "sg-0123456789abcdef0"
  }
}
```

**Network Configuration Fields:**

- `VPC_ID`: Existing VPC ID to use
- `TARGET_SUBNETS`: Array of subnet IDs (required if VPC_ID is specified)
- `SECURITY_GROUP_ID`: Existing security group ID (optional)
- `VPC_NAME`: Name for a new VPC (default: "tile-server-vpc")
- `SECURITY_GROUP_NAME`: Name for a new security group (default: "tile-server-security-group")
- `MAX_AZS`: Maximum number of availability zones for the VPC

**Note**: All networkConfig keys must be in UPPERCASE_SNAKE_CASE format.

##### Dataplane Configuration (Optional)

Customize application resources:

```json
{
  "projectName": "OSML",
  "account": { "..." },
  "dataplaneConfig": {
    "ECS_TASK_CPU": 4096,
    "ECS_TASK_MEMORY": 8192,
    "ECS_CONTAINER_CPU": 4096,
    "ECS_CONTAINER_MEMORY": 8192,
    "BUILD_FROM_SOURCE": true,
    "CONTAINER_URI": "awsosml/osml-tile-server:latest"
  }
}
```

**Common Dataplane Configuration Fields:**

- `ECS_TASK_CPU`: CPU units for ECS task (default: 8192)
- `ECS_TASK_MEMORY`: Memory in MiB for ECS task (default: 16384)
- `ECS_CONTAINER_CPU`: CPU units for container (default: 8192)
- `ECS_CONTAINER_MEMORY`: Memory in MiB for container (default: 16384)
- `BUILD_FROM_SOURCE`: Build Docker image from source (default: false)
- `CONTAINER_URI`: Docker image URI (default: "awsosml/osml-tile-server:latest")
- `ECS_CLUSTER_NAME`: Name of ECS cluster (default: "TSCluster")
- `DDB_JOB_TABLE`: DynamoDB table name (default: "TSJobTable")
- `SQS_JOB_QUEUE`: SQS queue name (default: "TSJobQueue")

**Note**: All dataplaneConfig keys must be in UPPERCASE_SNAKE_CASE format.

##### Integration Test Configuration (Optional)

Enable integration testing infrastructure:

```json
{
  "projectName": "OSML",
  "account": { "..." },
  "deployIntegrationTests": true,
  "testImageryConfig": {
    "S3_IMAGE_BUCKET_PREFIX": "ts-test-imagery",
    "S3_TEST_IMAGES_PATH": "../test/data/integ/"
  },
  "testConfig": {
    "BUILD_FROM_SOURCE": true,
    "TEST_CONTAINER_URI": "awsosml/osml-tile-server-test:latest"
  }
}
```

**Test Configuration Fields:**

- `deployIntegrationTests`: Set to `true` to deploy test infrastructure (default: true)
- `testImageryConfig`: Configuration for test imagery
  - `S3_IMAGE_BUCKET_PREFIX`: Prefix for test imagery bucket (default: "ts-test-imagery")
  - `S3_TEST_IMAGES_PATH`: Path to test images (default: "../test/data/integ/")
- `testConfig`: Test Lambda function configuration
  - `BUILD_FROM_SOURCE`: Build test container from source (default: false)
  - `TEST_CONTAINER_URI`: Docker image for tests (default: "awsosml/osml-tile-server-test:latest")

**Note**: All test configuration keys must be in UPPERCASE_SNAKE_CASE format.

#### Complete Configuration Example

```json
{
  "projectName": "OSML",
  "account": {
    "id": "123456789012",
    "region": "us-west-2",
    "prodLike": false,
    "isAdc": false
  },
  "networkConfig": {
    "VPC_ID": "vpc-0123456789abcdef0",
    "TARGET_SUBNETS": ["subnet-0123456789abcdef0", "subnet-0123456789abcdef1"]
  },
  "dataplaneConfig": {
    "ECS_TASK_CPU": 4096,
    "ECS_TASK_MEMORY": 8192,
    "BUILD_FROM_SOURCE": true
  },
  "deployIntegrationTests": true,
  "testConfig": {
    "BUILD_FROM_SOURCE": true
  }
}
```

## Deployment

### Build and Deploy

From the `cdk` directory:

```bash
# Synthesize CloudFormation templates (optional - for review)
cdk synth

# Deploy all stacks
cdk deploy --all --require-approval never
```

The deployment process will:

1. Synthesize CloudFormation templates
2. Deploy the Network Stack
3. Deploy the Tile Server Stack
4. Deploy the Test Stack (if `deployIntegrationTests` is true)

### Deployment Process

During deployment, you'll see:

- CloudFormation stack creation progress
- Resource creation status
- Any errors or warnings

**Deployment typically takes 15-25 minutes** depending on:

- Whether you're creating a new VPC or using an existing one
- The number of availability zones
- Container image build and push time

### Verify Deployment

After successful deployment, the CDK will output:

- Application Load Balancer URL
- ECS Service name
- DynamoDB table names
- S3 bucket names

Example output:

```
OSML-TileServerNetwork
OSML-TileServer

Outputs:
OSML-TileServer.LoadBalancerDNS = OSML-TileServer-ALB-1234567890.us-west-2.elb.amazonaws.com
OSML-TileServer.ServiceName = OSML-TileServer-Service
```

### Access the Tile Server

The tile server will be accessible at the Application Load Balancer URL:

```
http://<LoadBalancerDNS>/latest/docs
```

Example API endpoints:

- Swagger UI: `http://<LoadBalancerDNS>/latest/docs`
- ReDoc: `http://<LoadBalancerDNS>/latest/redoc`
- Health Check: `http://<LoadBalancerDNS>/health`

## Integration Testing

### Overview

The integration testing infrastructure validates that the deployed tile server is functioning correctly by:

1. Uploading test imagery to S3
2. Creating viewpoints for the test images
3. Requesting tiles from the tile server
4. Validating tile responses and metadata

### Running Integration Tests

After deployment with `deployIntegrationTests: true`:

```bash
bash ../scripts/tile_server_integ.sh
```

The test script will:

1. Detect your AWS region and account ID
2. Invoke the Lambda test runner function
3. Display test results in your terminal

### Test Output

Successful test run:

```
==========================================
  Running Tile Server Integration Tests
==========================================
Invoking the Lambda function 'TSTestRunner' with payload:
Payload: {"image_uri": "s3://ts-test-imagery-123456789012/small.tif"}
Region: us-west-2

Test Summary
Tests: 13, Passed: 13, Failed: 0, Success: 100.00%
==========================================
       Integration Tests Completed
==========================================
            All tests passed!
==========================================
```

### Manual Test Execution

You can also manually invoke the test Lambda function:

```bash
aws lambda invoke \
  --function-name TSTestRunner \
  --region us-west-2 \
  --payload '{"image_uri": "s3://ts-test-imagery-ACCOUNT-ID/small.tif"}' \
  --log-type Tail \
  response.json
```

### Debugging Test Failures

If tests fail:

1. **Check Lambda Logs**:

   ```bash
   aws logs tail /aws/lambda/TSTestRunner --follow
   ```

2. **Check ECS Service Logs**:

   ```bash
   aws logs tail /ecs/OversightML-TileServer --follow
   ```

3. **Verify Test Imagery**:
   - Ensure test imagery was uploaded to S3
   - Check S3 bucket: `ts-test-imagery-<ACCOUNT-ID>`

4. **Check ALB Health**:
   - Verify ALB target group shows healthy targets
   - Check ALB access logs for request patterns

## Cleanup

### Destroy All Resources

To remove all deployed resources:

```bash
cdk destroy --all --force
```

This will:

1. Delete the Test Stack (if deployed)
2. Delete the Tile Server Stack
3. Delete the Network Stack

**Warning**: Data retention behavior depends on the `prodLike` setting:

- **prodLike: false** - Resources are destroyed and all data in DynamoDB tables and S3 buckets will be **permanently deleted**
- **prodLike: true** - Resources are retained and data is **preserved** even after stack deletion

### Manual Cleanup

If automated cleanup fails, you can manually delete stacks:

```bash
# Delete individual stacks
cdk destroy OversightML-TileServerTest
cdk destroy OversightML-TileServer
cdk destroy OversightML-TileServerNetwork
```

### Retained Resources

Some resources may be retained after stack deletion:

- **S3 Buckets**: May be retained if they contain data
- **CloudWatch Logs**: Log groups are typically retained
- **ECR Images**: Container images in ECR

To fully clean up:

```bash
# List and delete S3 buckets
aws s3 ls | grep tile-server
aws s3 rb s3://<bucket-name> --force

# Delete CloudWatch log groups
aws logs describe-log-groups --query 'logGroups[?contains(logGroupName, `TileServer`)].logGroupName' --output text | \
xargs -I {} aws logs delete-log-group --log-group-name {}
```

## Troubleshooting

### Common Issues

#### 1. CDK Bootstrap Required

**Error**: `[Account/Region] has not been bootstrapped`

**Solution**:

```bash
cdk bootstrap
```

#### 2. Deployment Configuration Missing

**Error**: `Missing deployment.json file`

**Solution**:

```bash
cp bin/deployment/deployment.json.example bin/deployment/deployment.json
# Edit deployment.json with your settings
```

#### 3. Invalid AWS Credentials

**Error**: `Unable to resolve AWS credentials`

**Solution**:

```bash
# Configure AWS CLI
aws configure

# Or set environment variables
export AWS_ACCESS_KEY_ID=<your-access-key>
export AWS_SECRET_ACCESS_KEY=<your-secret-key>
export AWS_DEFAULT_REGION=<your-region>
```

#### 4. Docker Not Running

**Error**: `Cannot connect to the Docker daemon`

**Solution**:

```bash
# Start Docker (linux)
sudo systemctl start docker
```

#### 5. VPC Subnet Validation Error

**Error**: `When VPC_ID is provided, TARGET_SUBNETS must also be specified`

**Solution**: If specifying a VPC ID, you must also provide subnet IDs:

```json
{
  "networkConfig": {
    "VPC_ID": "vpc-xxx",
    "TARGET_SUBNETS": ["subnet-xxx", "subnet-yyy"]
  }
}
```

#### 6. ECS Service Fails to Start

**Symptoms**: ECS tasks are stuck in PENDING or fail to start

**Solutions**:

- Check ECS task logs in CloudWatch
- Verify Docker image was pushed to ECR successfully
- Ensure IAM roles have required permissions
- Check security group allows ALB to communicate with ECS tasks
- Verify subnets have internet connectivity (NAT Gateway or Internet Gateway)

#### 7. Integration Tests Fail

**Symptoms**: Tests report failures or timeout

**Solutions**:

- Verify ALB is healthy and reachable
- Check test imagery was uploaded to S3: `aws s3 ls s3://ts-test-imagery-<ACCOUNT-ID>/`
- Review Lambda function logs
- Ensure security groups allow Lambda to reach ALB
- Verify VPC has proper DNS resolution

### Getting Help

If you encounter issues not covered here:

1. **Check AWS CloudFormation Console**:
   - Review stack events for detailed error messages
   - Check resource creation failures

2. **Review CloudWatch Logs**:
   - ECS task logs
   - Lambda function logs
   - ALB access logs

3. **Enable CDK Debug Output**:

   ```bash
   cdk deploy --debug
   ```

4. **Consult AWS Documentation**:
   - [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
   - [Amazon ECS Documentation](https://docs.aws.amazon.com/ecs/)
   - [AWS CloudFormation Documentation](https://docs.aws.amazon.com/cloudformation/)

## Development

### Project Structure

The CDK application is organized into:

- **bin/**: Application entry point (`app.ts`) and deployment configuration
- **lib/**: CDK stack definitions and reusable constructs
  - Stack files: `network-stack.ts`, `tile-server-stack.ts`, `test-stack.ts`
  - Constructs organized by purpose: `tile-server/` and `test/`
- **test/**: Unit tests for CDK constructs using Jest
- **cdk.json**: CDK toolkit configuration

### Running Unit Tests

```bash
# Run Jest unit tests
npm test

# Run tests with coverage
npm test -- --coverage

# Run tests in watch mode
npm test -- --watch
```

### Linting and Formatting

```bash
# Run ESLint
eslint --fix --max-warnings 0 "**/*.{js,ts}"
```

## Security & Best Practices

This project integrates cdk-nag to validate infrastructure against AWS security best practices. Running `npm run test` will:

- Detect overly permissive IAM roles and security groups
- Ensure encryption is enabled where applicable
- Warn about missing logging or compliance settings

Review the cdk-nag report to maintain compliance and security posture before production deployments.

### CDK-NAG Report Generation

The test suite automatically generates comprehensive cdk-nag compliance reports during test execution. The reporting system works as follows:

#### How Reports Are Generated

**During Test Execution:** Each construct test (database.test.ts, network.test.ts, ecs-service.test.ts, etc.) runs cdk-nag's AwsSolutionsChecks and calls `generateNagReport()` which:

- Extracts errors and warnings from stack annotations
- Collects suppressed violations from stack template metadata
- Displays a formatted compliance report to stdout
- Aggregates suppressed violations for the final report

**After All Tests Complete:** The Jest global teardown hook (configured in jest.config.js) automatically calls `generateFinalSuppressedViolationsReport()`, which:

- Consolidates all suppressed violations from all test stacks
- Generates a comprehensive report file: `cdk-nag-suppressions-report.txt`
- Includes summary statistics by rule type and detailed breakdowns by stack

#### Report Files

After running tests, you'll find:

**cdk-nag-suppressions-report.txt**: Comprehensive report of all suppressed NAG violations across all stacks

- Summary by rule type showing violation counts
- Detailed breakdown per stack with resource-level information
- Suppression reasons for each violation

#### Viewing Reports

```bash
# Run tests to generate reports
npm run test

# View the final suppressed violations report
cat cdk-nag-suppressions-report.txt
```

#### Understanding Suppressions

The report distinguishes between:

- **Errors**: Unsuppressed violations that need to be fixed
- **Warnings**: Unsuppressed warnings that should be reviewed
- **Suppressed Violations**: Violations that have been explicitly suppressed with documented reasons

Each suppressed violation includes:

- The NAG rule that was suppressed (e.g., AwsSolutions-S1)
- The resource where the suppression applies
- The reason for suppression (as documented in the code)

For deeper hardening guidance, refer to:

- [AWS CDK Security and Safety Dev Guide](https://docs.aws.amazon.com/cdk/v2/guide/security-best-practices.html)
- [Use of CliCredentialsStackSynthesizer for controlling credential use](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.CliCredentialsStackSynthesizer.html)
