#  Copyright 2023-2026 Amazon.com, Inc. or its affiliates.

import os
import unittest
from unittest.mock import AsyncMock, patch

import boto3
import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from moto import mock_aws
from test_config import TestConfig


@pytest.fixture
def proxy_middleware():
    """Create a ProxyHeadersMiddleware with a mock app."""
    from aws.osml.tile_server.main import ProxyHeadersMiddleware

    mock_app = AsyncMock()
    middleware = ProxyHeadersMiddleware(mock_app)
    return middleware, mock_app


@pytest.mark.asyncio
async def test_proxy_middleware_with_forwarded_host_rewrites_host_and_scheme(proxy_middleware):
    """Test that X-Forwarded-Host rewrites host header and sets scheme to https."""
    middleware, mock_app = proxy_middleware
    scope = {
        "type": "http",
        "scheme": "http",
        "headers": [
            (b"host", b"internal-lb.example.com"),
            (b"x-forwarded-host", b"public.example.com"),
            (b"x-forwarded-proto", b"http"),
        ],
    }

    await middleware(scope, AsyncMock(), AsyncMock())

    modified_scope = mock_app.call_args[0][0]
    assert modified_scope["scheme"] == "https"
    headers_dict = dict(modified_scope["headers"])
    assert headers_dict[b"host"] == b"public.example.com"


@pytest.mark.asyncio
async def test_proxy_middleware_with_forwarded_proto_only_changes_scheme(proxy_middleware):
    """Test that X-Forwarded-Proto alone only changes the scheme."""
    middleware, mock_app = proxy_middleware
    scope = {
        "type": "http",
        "scheme": "http",
        "headers": [
            (b"host", b"internal-lb.example.com"),
            (b"x-forwarded-proto", b"https"),
        ],
    }

    await middleware(scope, AsyncMock(), AsyncMock())

    modified_scope = mock_app.call_args[0][0]
    assert modified_scope["scheme"] == "https"
    headers_dict = dict(modified_scope["headers"])
    assert headers_dict[b"host"] == b"internal-lb.example.com"


@pytest.mark.asyncio
async def test_proxy_middleware_without_forwarded_headers_no_changes(proxy_middleware):
    """Test that requests without forwarded headers pass through unchanged."""
    middleware, mock_app = proxy_middleware
    scope = {
        "type": "http",
        "scheme": "http",
        "headers": [
            (b"host", b"internal-lb.example.com"),
            (b"content-type", b"application/json"),
        ],
    }

    await middleware(scope, AsyncMock(), AsyncMock())

    passed_scope = mock_app.call_args[0][0]
    assert passed_scope["scheme"] == "http"
    headers_dict = dict(passed_scope["headers"])
    assert headers_dict[b"host"] == b"internal-lb.example.com"


@pytest.mark.asyncio
async def test_proxy_middleware_non_http_scope_passes_through(proxy_middleware):
    """Test that non-HTTP scopes (like websocket) pass through unchanged."""
    middleware, mock_app = proxy_middleware
    scope = {
        "type": "websocket",
        "scheme": "ws",
        "headers": [
            (b"host", b"internal-lb.example.com"),
            (b"x-forwarded-host", b"public.example.com"),
        ],
    }

    await middleware(scope, AsyncMock(), AsyncMock())

    passed_scope = mock_app.call_args[0][0]
    assert passed_scope["scheme"] == "ws"
    headers_dict = dict(passed_scope["headers"])
    assert headers_dict[b"host"] == b"internal-lb.example.com"


@pytest.mark.asyncio
async def test_proxy_middleware_preserves_other_headers(proxy_middleware):
    """Test that other headers are preserved when rewriting host."""
    middleware, mock_app = proxy_middleware
    scope = {
        "type": "http",
        "scheme": "http",
        "headers": [
            (b"host", b"internal-lb.example.com"),
            (b"x-forwarded-host", b"public.example.com"),
            (b"authorization", b"Bearer token123"),
            (b"content-type", b"application/json"),
        ],
    }

    await middleware(scope, AsyncMock(), AsyncMock())

    modified_scope = mock_app.call_args[0][0]
    headers_dict = dict(modified_scope["headers"])
    assert headers_dict[b"authorization"] == b"Bearer token123"
    assert headers_dict[b"content-type"] == b"application/json"


@mock_aws
class TestTileServer(unittest.TestCase):
    """Integration tests for the OSML Tile Server using mocked AWS services."""

    @patch("aws.osml.tile_server.services.initialize_token_key")
    @patch("aws.osml.tile_server.services.read_token_key", return_value=Fernet.generate_key())
    def setUp(self, mock_read_token, mock_init_token):
        """Set up the mock AWS services and the test client."""
        from aws.osml.tile_server.app_config import BotoConfig

        # Create virtual S3
        self.s3_resource = boto3.resource("s3", config=BotoConfig.default)
        self.s3_resource.create_bucket(
            Bucket=TestConfig.test_bucket, CreateBucketConfiguration={"LocationConstraint": os.environ["AWS_DEFAULT_REGION"]}
        )
        self.s3_resource.meta.client.upload_file(
            TestConfig.test_file_path, TestConfig.test_bucket, TestConfig.test_object_key
        )

        # Create virtual DynamoDB
        self.ddb = boto3.resource("dynamodb", config=BotoConfig.default)
        self.table = self.ddb.create_table(
            TableName=TestConfig.test_viewpoint_table_name,
            KeySchema=TestConfig.test_viewpoint_key_schema,
            AttributeDefinitions=TestConfig.test_viewpoint_attribute_def,
            BillingMode="PAY_PER_REQUEST",
        )

        # Create virtual SQS
        self.sqs = boto3.resource("sqs", config=BotoConfig.default)
        self.queue = self.sqs.create_queue(QueueName=TestConfig.test_viewpoint_request_queue_name)

        # Set up the FastAPI test client
        from aws.osml.tile_server.main import app

        self.client = TestClient(app)

    def tearDown(self):
        """Clean up after each test."""
        self.client = None

    def test_main(self):
        """Test the main page of the tile server."""
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("OSML Tile Server", response.text)

    def test_ping(self):
        """Test the ping endpoint to ensure the server is running."""
        response = self.client.get("/ping")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "OK"})


if __name__ == "__main__":
    unittest.main()
