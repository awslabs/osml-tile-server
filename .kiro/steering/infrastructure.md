# OSML Infrastructure

CDK patterns, deployment, Docker, and CI/CD for OversightML projects.

## CDK Project Structure

```
cdk/
├── bin/
│   ├── app.ts                    # CDK app entry point
│   └── deployment/
│       ├── deployment.json       # Environment config (gitignored)
│       └── deployment.json.example
├── lib/
│   ├── *-stack.ts               # Stack definitions
│   └── constructs/              # Reusable constructs
└── test/                        # CDK tests with cdk-nag
```

## CDK Commands

```bash
cd cdk
npm install          # Install dependencies
npm run build        # Compile TypeScript
npm run test         # Run Jest + cdk-nag
cdk synth           # Generate CloudFormation
cdk diff            # Compare with deployed
cdk deploy          # Deploy stack
cdk destroy         # Remove stack
```

## CDK Nag Compliance

All stacks must pass `AwsSolutionsChecks` with zero unsuppressed errors/warnings.

```typescript
import { Aspects } from "aws-cdk-lib";
import { AwsSolutionsChecks } from "cdk-nag";

Aspects.of(stack).add(new AwsSolutionsChecks({ verbose: true }));
```

### Suppressing Violations

Document suppressions with clear reasons:

```typescript
import { NagSuppressions } from "cdk-nag";

NagSuppressions.addResourceSuppressions(myResource, [
  {
    id: "AwsSolutions-S1",
    reason: "Access logging bucket does not require its own access logs"
  }
]);
```

## ADC (Amazon Dedicated Cloud) Considerations

OSML supports ADC partitions (aws-iso, aws-iso-b) via the `isAdc` flag.

### Account Configuration

```json
{
  "account": {
    "id": "123456789012",
    "region": "us-iso-east-1",
    "prodLike": true,
    "isAdc": true
  }
}
```

### Regional Endpoints

ADC partitions require partition-specific endpoints:

```typescript
export class RegionalConfig {
  private static readonly configs: Record<string, RegionalConfigData> = {
    "us-east-1": { s3Endpoint: "s3.amazonaws.com", maxVpcAzs: 3 },
    "us-iso-east-1": { s3Endpoint: "s3.us-iso-east-1.c2s.ic.gov", maxVpcAzs: 2 },
    "us-isob-east-1": { s3Endpoint: "s3.us-isob-east-1.sc2s.sgov.gov", maxVpcAzs: 2 }
  };
}
```

### Conditional Features

```typescript
if (props.account.isAdc) {
  // ADC-compatible implementation
  const cfnResource = resource.node.defaultChild as CfnResource;
  cfnResource.addPropertyDeletionOverride("UnsupportedProperty");
} else {
  // Standard implementation
}
```

## Docker Patterns

- Dockerfiles in `docker/` directory
- Use Conda environments from `conda/`
- Multi-stage builds for smaller images
- Run as non-root user

```dockerfile
# Architecture-aware Miniconda install
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "aarch64" ]; then \
        MINICONDA_VERSION="Miniconda3-latest-Linux-aarch64"; \
    else \
        MINICONDA_VERSION="Miniconda3-latest-Linux-x86_64"; \
    fi && \
    wget -c https://repo.anaconda.com/miniconda/${MINICONDA_VERSION}.sh && \
    chmod +x ${MINICONDA_VERSION}.sh && \
    ./${MINICONDA_VERSION}.sh -b -f -p /opt/conda

COPY conda/<component>.yml environment.yml
RUN conda env create -f environment.yml
```

## CI/CD Patterns

### Reusable Workflows

```yaml
# .github/workflows/build.yml
name: Build
on:
  pull_request:
    branches: ["main"]

jobs:
  test:
    uses: ./.github/workflows/tox.yml
    secrets: inherit
  docker:
    uses: ./.github/workflows/docker.yml
    secrets: inherit
```

### AWS OIDC Authentication

```yaml
- uses: aws-actions/configure-aws-credentials@v4
  with:
    aws-region: ${{ inputs.aws_region }}
    role-to-assume: arn:aws:iam::${{ inputs.account_id }}:role/GithubAction-AssumeRoleWithAction
    role-session-name: GitHub_to_AWS_via_FederatedOIDC
```

## PR Checklist

- [ ] Code changes are compact and well-structured
- [ ] Tests cover all new code
- [ ] Pre-commit hooks pass
- [ ] CDK Nag compliance checks pass
- [ ] Security implications reviewed
- [ ] Documentation updated
