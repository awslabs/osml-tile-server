#  Copyright 2024-2025 Amazon.com, Inc. or its affiliates.
import os
from datetime import datetime, timezone
from typing import Any, Dict


class TileServerIntegTestConfig:
    def __init__(self, s3_bucket: str, s3_key: str):
        # Tile Server
        self.endpoint = os.getenv("TS_ENDPOINT")

        # S3
        self.test_bucket = s3_bucket
        self.test_object_key = s3_key

        self.test_viewpoint_id: str = (
            datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z").replace("-", "").replace(":", "")
        )
        self.test_viewpoint_name: str = "integ-test-viewpoint"

        # Test Data
        self.test_viewpoint: Dict[str, Any] = {
            "bucket_name": self.test_bucket,
            "object_key": self.test_object_key,
            "viewpoint_id": self.test_viewpoint_id,
            "viewpoint_name": self.test_viewpoint_name,
            "tile_size": 512,
            "range_adjustment": "NONE",
        }

        self.invalid_viewpoint: Dict[str, Any] = {
            "bucket_name": None,
            "object_key": self.test_object_key,
            "viewpoint_id": self.test_viewpoint_id,
            "viewpoint_name": self.test_viewpoint_name,
            "tile_size": 512,
            "range_adjustment": "NONE",
        }

        self.valid_update_test_body: Dict[str, Any] = {
            "viewpoint_id": "",
            "viewpoint_name": "new-integ-test-viewpoint-name",
            "tile_size": 512,
            "range_adjustment": "NONE",
        }

        self.invalid_update_test_body: Dict[str, Any] = {
            "tile_size": 512,
            "range_adjustment": "NONE",
        }
