# OSML Testing Guidelines

Testing framework, commands, and best practices for OversightML projects.

## Running Tests

OSML projects use **tox** for test automation across Python versions.

### Common Commands

```bash
# Run all tests
tox

# Run specific Python version
tox -e py312

# Run specific test file
tox -- path/to/test_file.py::test_name

# Run with verbose output
tox -- -v

# Show print statements
tox -- -s

# Run integration tests (requires deployed infrastructure)
tox -- -m integration

# Exclude integration tests
tox -- -m "not integration"
```

### Other Tox Environments

```bash
tox -e lint    # Run pre-commit hooks
tox -e docs    # Build Sphinx documentation
tox -e twine   # Validate distribution package
```

## Test Structure

Tests mirror the source structure:

```
test/
├── aws/osml/<component>/    # Unit tests (mirror src/)
├── integ/                   # Integration tests
├── load/                    # Load/performance tests
└── data/                    # Test fixtures
```

## Writing Tests

### Framework and Tools

- **pytest** - Test framework
- **pytest-cov** - Coverage reporting
- **pytest-asyncio** - Async test support
- **mock** - Mocking utilities
- **moto** - AWS service mocking

### Test Environment Variables

Tox automatically sets mock AWS credentials:
```ini
AWS_DEFAULT_REGION=us-west-2
AWS_ACCESS_KEY_ID=testing
AWS_SECRET_ACCESS_KEY=testing
```

### Markers

```python
import pytest

@pytest.mark.integration
def test_deployed_service():
    """Requires deployed infrastructure."""
    pass

@pytest.mark.asyncio
async def test_async_operation():
    """Async test."""
    pass
```

### Mocking AWS Services

```python
from moto import mock_aws

@mock_aws
def test_s3_operation():
    import boto3
    s3 = boto3.client("s3", region_name="us-west-2")
    s3.create_bucket(Bucket="test-bucket",
                     CreateBucketConfiguration={"LocationConstraint": "us-west-2"})
    # Test logic here
```

## Coverage Requirements

- Minimum coverage: **80%**
- Coverage reports generated in `htmlcov/`
- Configure thresholds in `.coveragerc`

## Integration Tests

Integration test mechanisms vary by project. Common patterns:

1. Mark with `@pytest.mark.integration`
2. Require deployed infrastructure
3. Use real AWS credentials (not mocked)
4. Run separately: `tox -- -m integration`

Refer to each project's README for specific integration test instructions.

## Best Practices

- Always use `tox` to run tests, not `pytest` directly
- Tests run in isolated conda environments
- Keep unit tests fast and independent
- Use fixtures for common setup
- Mock external dependencies in unit tests
