# Copyright 2024-2025 Amazon.com, Inc. or its affiliates.

import asyncio
from dataclasses import dataclass
from typing import Any, Dict

from .integration import TestTileServer, TileServerIntegTestConfig
from .processor_base import ProcessorBase
from .utils import S3Url


@dataclass
class TSTestRequest:
    """
    Data class representing the integration test request parameters.

    Attributes:
        image_uri: The URI of the container image to test.
    """

    image_uri: str


class TSIntegTestProcessor(ProcessorBase):
    def __init__(self, event):
        """
        Initialize the processor with the runtime arguments.

        :param event: The event dictionary containing runtime parameters.
        """
        self.request = TSTestRequest(**event)
        self.s3_url = S3Url(self.request.image_uri)
        self.test_config = TileServerIntegTestConfig(s3_bucket=self.s3_url.bucket, s3_key=self.s3_url.key)
        self.ts_server = TestTileServer(self.test_config)

    async def process(self) -> Dict[str, Any]:
        """
        Process the runtime arguments, determine the test type, and execute the appropriate test.

        :returns: A response indicating the status of the process.
        """
        try:
            self.ts_server.run_integ_test()
            return self.success_message("Test executed successfully")
        except Exception as e:
            return self.failure_message(e)


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    The AWS Lambda handler function to process an event.

    :param event: The event payload containing the runtime parameters.
    :param context: The Lambda execution context (unused).
    :return: The response from the TileServerTestProcessor process.
    """
    processor = TSIntegTestProcessor(event)
    return asyncio.get_event_loop().run_until_complete(processor.process())
