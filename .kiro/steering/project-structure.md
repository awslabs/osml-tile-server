# OSML Project Structure

Standard directory layout and conventions for OversightML projects.

## Directory Layout

```
osml-*/
├── .github/                    # CI/CD workflows and actions
│   ├── actions/               # Reusable composite actions
│   └── workflows/             # GitHub Actions workflows
├── bin/                       # Entry point scripts
├── cdk/                       # AWS CDK infrastructure
│   ├── bin/                   # CDK app entry point
│   │   └── deployment/        # Deployment configuration
│   ├── lib/                   # CDK constructs and stacks
│   │   └── constructs/        # Modular CDK constructs
│   └── test/                  # CDK unit tests
├── conda/                     # Conda environment definitions
├── docker/                    # Dockerfile configurations
├── doc/                       # Sphinx documentation
├── scripts/                   # Utility and operations scripts
├── src/aws/osml/              # Python source (namespace package)
└── test/                      # Python tests
    ├── aws/osml/              # Unit tests (mirror src structure)
    ├── integ/                 # Integration tests
    └── load/                  # Load/performance tests
```

## Python Namespace Package

All OSML Python code uses the `aws.osml` namespace:
- Source: `src/aws/osml/<component>/`
- Tests mirror source: `test/aws/osml/<component>/`
- Import pattern: `from aws.osml.<component> import ...`

## Configuration Files

| File | Purpose |
|------|---------|
| `pyproject.toml` | Build system, tool configs (black, isort, pytest) |
| `setup.cfg` | Package metadata, dependencies |
| `setup.py` | Setuptools entry point |
| `tox.ini` | Test automation across Python versions |
| `.pre-commit-config.yaml` | Pre-commit hook configuration |
| `.flake8` | Flake8 linting rules |
| `.coveragerc` | Coverage settings (minimum 80%) |

## Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Python modules | `snake_case.py` | `image_request.py` |
| Python classes | `PascalCase` | `ImageRequest` |
| Python functions | `snake_case()` | `process_image()` |
| TypeScript files | `kebab-case.ts` | `geo-agent-stack.ts` |
| TypeScript classes | `PascalCase` | `GeoAgentStack` |
| CDK constructs | `PascalCase` + suffix | `NetworkStack`, `AgentConstruct` |
| Environment variables | `UPPER_SNAKE_CASE` | `AWS_DEFAULT_REGION` |

## Import Organization

Python imports follow this order (enforced by isort):
1. Standard library
2. Third-party packages
3. Local application imports

```python
import json
from typing import Any, Optional

import boto3
from pydantic import BaseModel

from aws.osml.component import MyClass
```
