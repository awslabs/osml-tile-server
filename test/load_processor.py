# Copyright 2024-2025 Amazon.com, Inc. or its affiliates.
import asyncio
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List

from gevent import monkey

from .load import run_load_test
from .processor_base import ProcessorBase
from .utils.logger import logger

# locust workaround https://github.com/gevent/gevent/issues/1016
monkey.patch_all()


@dataclass
class TSLoadTestRequest:
    """
    Data class representing the load test request parameters.

    Attributes:
        image_uri: The URI of the container image to test.
        test_type: The type of test to run.
        locust_headless: Whether to disable the Locust web interface and start the test immediately.
        locust_users: The peak number of concurrent Locust users.
        locust_run_time: The duration to run the load test.
        locust_spawn_rate: The rate at which users are spawned (users per second).
        locust_image_keys: A list of image keys to use for the load test.
    """

    image_uri: str
    test_type: str
    locust_headless: bool = field(default=False)
    locust_users: str = field(default="1")
    locust_run_time: str = field(default="5m")
    locust_spawn_rate: str = field(default="1")
    locust_image_keys: List[str] = field(default_factory=list)


class TSLoadTestProcessor(ProcessorBase):
    def __init__(self, event: Dict[str, Any]):
        """
        Initialize the processor with the runtime arguments.

        :param event: The event dictionary containing runtime parameters.
        """
        self.request = TSLoadTestRequest(**event)

    async def process(self) -> Dict[str, Any]:
        """
        Process the runtime arguments, determine the test type, and execute the appropriate test.

        :returns: A response indicating the status of the process.
        """
        try:
            run_load_test(os.environ.get("LOCUST_RUN_TIME", ""))
            return self.success_message("Load test executed successfully")
        except Exception as e:
            return self.failure_message(e)

    def set_load_test_env(self) -> None:
        """
        Set up the environment variables for running the Locust load test.
        """
        datetime_now_string = datetime.now(timezone.utc).isoformat(timespec="seconds").replace(":", "")

        # https://stackoverflow.com/questions/46397580/how-to-invoke-locust-tests-programmatically
        os.environ["LOCUST_LOCUSTFILE"] = "src/aws/osml/load/locust_ts_user.py"
        if self.request.locust_headless:
            os.environ["LOCUST_HEADLESS"] = str(self.request.locust_headless)
            os.environ["LOCUST_RUN_TIME"] = self.request.locust_run_time
            os.environ["LOCUST_USERS"] = self.request.locust_users
            os.environ["LOCUST_SPAWN_RATE"] = self.request.locust_spawn_rate
        else:
            os.environ["LOCUST_CSV"] = datetime_now_string
            os.environ["LOCUST_HTML"] = datetime_now_string
        os.environ["LOCUST_HOST"] = os.environ.get("TS_ENDPOINT")

        # custom Locust params
        os.environ["LOCUST_TEST_IMAGES_BUCKET"] = os.environ.get("TEST_BUCKET")
        os.environ["LOCUST_TEST_IMAGE_KEYS"] = "GET LIST OF OBJECTS IN BUCKET"
        logger.info(f"Setup Locust Test Environment: {os.environ}")


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    The AWS Lambda handler function to process an event.

    :param event: The event payload containing the runtime parameters.
    :param context: The Lambda execution context (unused).
    :return: The response from the TileServerTestProcessor process.
    """
    processor = TSLoadTestProcessor(event)
    return asyncio.get_event_loop().run_until_complete(processor.process())
