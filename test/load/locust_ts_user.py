#  Copyright 2024-2025 Amazon.com, Inc. or its affiliates.

import json
import logging
import os
import random
import time
from math import ceil, log
from secrets import token_hex
from typing import List, Optional

import gevent
from hilbertcurve.hilbertcurve import HilbertCurve
from locust import FastHttpUser, between, events, task

VIEWPOINT_STATUS = "viewpoint_status"

VIEWPOINT_ID = "viewpoint_id"


@events.init_command_line_parser.add_listener
def _(parser):
    parser.add_argument("--test_images_bucket", type=str, default=os.environ.get("LOCUST_TEST_IMAGES_BUCKET"))
    parser.add_argument("--test_image_keys", type=str, default=os.environ.get("LOCUST_TEST_IMAGE_KEYS", "[]"))


@events.test_start.add_listener
def _(environment, **kwargs):
    """
    This method logs the test images bucket and object prefix from the given environment.

    :param environment: The environment object containing parsed options.
    :param kwargs: Additional keyword arguments (unused).
    :return: None
    """
    logging.info(f"Using bucket: {environment.parsed_options.test_images_bucket}")
    logging.info(f"Using images: {environment.parsed_options.test_image_keys}")


class TileServerUser(FastHttpUser):
    """
    :class:`TileServerUser` is a class representing a user that interacts with a tile server. It inherits from
    `FastHttpUser` class provided by the `locust` library. The class provides methods for simulating user behavior on
    the tile server, such as creating, retrieving, and discarding viewpoints, as well as querying metadata, bounds,
    info, and statistics of existing viewpoints.

    Examples:
        Creating an instance of :class:`TileServerUser` and running a load test with Locust:

        .. code-block:: python

            from locust import User, TaskSet, constant, HttpUser, between
            from tile.server.user import TileServerUser

            class MyUser(HttpUser):
                tasks = [TileServerUser]
                wait_time = between(1, 2)

    To run the locust file:
    $res locust -f filename.py with python 3.8.5 and above; for old versions of python we may use locustio instead of locust
    :class:`TileServerUser` provides the following instance variables:
        - `test_images_bucket`: The S3 bucket name for test images.
        - `test_images_prefix`: The prefix for filtering test images within the S3 bucket.
        - `test_image_keys`: The list of test image keys in the S3 bucket.
        - `wait_time`: The time interval (in seconds) between each task execution.

    """

    # Establishes a 1-2 second wait between tasks
    wait_time = between(1, 2)
    max_retries = 3

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.test_images_bucket = self.environment.parsed_options.test_images_bucket
        if isinstance(self.environment.parsed_options.test_image_keys, list):
            self.test_image_keys = self.environment.parsed_options.test_image_keys
        else:
            self.test_image_keys = json.loads(self.environment.parsed_options.test_image_keys)
        logging.info(f"TileServerUser Initialization Parameters: {self.test_images_bucket} {self.test_image_keys}")

    def on_start(self) -> None:
        """
        Locust invokes this method when the user is created. It checks if test images were provided.
        """
        if not self.test_image_keys:
            raise ValueError("No test imagery specified by --locust_image_keys")
        else:
            logging.info(f"Using {len(self.test_image_keys)} test images")

    @task(5)
    def view_new_map_behavior(self) -> None:
        logging.debug("View New Map Behavior!")
        viewpoint_id = self.create_viewpoint(self.test_images_bucket, random.choice(self.test_image_keys), 256, "DRA")
        if viewpoint_id is not None:
            final_status = self.wait_for_viewpoint_ready(viewpoint_id)
            if final_status == "READY":
                self.request_map_tiles(viewpoint_id)

            if final_status in ["READY", "FAILED"]:
                self.cleanup_viewpoint(viewpoint_id)

    @task(5)
    def view_new_image_behavior(self) -> None:
        """
        This task simulates a user creating, retrieving tiles from, and then discarding a viewpoint.
        """
        logging.debug("View New Image Behavior!")
        viewpoint_id = self.create_viewpoint(
            self.test_images_bucket,
            random.choice(self.test_image_keys),
            random.choice([256, 512]),
            random.choice(["NONE", "DRA", "MINMAX"]),
        )
        if viewpoint_id is not None:
            final_status = self.wait_for_viewpoint_ready(viewpoint_id)
            if final_status == "READY":
                self.request_tiles(viewpoint_id)

            if final_status in ["READY", "FAILED"]:
                self.cleanup_viewpoint(viewpoint_id)

    @task(2)
    def discover_viewpoints_behavior(self) -> None:
        """
        This task simulates a user accessing a web page that displays an active list of viewpoints. The main query
        API is invoked then details including the image preview, metadata, and detailed statistics are called
        for each image.
        """

        logging.debug("Discover Viewpoints Behavior")
        # TODO: Update this to work on a per-page basis once the list viewpoints operation is paginated
        viewpoint_ids = self.list_ready_viewpoints()

        def get_viewpoint_details(viewpoint_id: str):
            self.get_viewpoint_metadata(viewpoint_id)
            self.get_viewpoint_info(viewpoint_id)
            self.get_viewpoint_bounds(viewpoint_id)
            self.get_viewpoint_preview(viewpoint_id)
            self.get_viewpoint_statistics(viewpoint_id)

        pool = gevent.pool.Pool()
        for viewpoint_id in viewpoint_ids:
            pool.spawn(get_viewpoint_details, viewpoint_id)
        pool.join()

    def create_viewpoint(
        self, test_images_bucket: str, test_image_key: str, tile_size: int = 256, range_adjustment: str = "DRA"
    ) -> Optional[str]:
        """
        Creates a viewpoint with specified parameters.

        :param test_images_bucket: bucket containing test images
        :param test_image_key: key of the test image
        :return: ID of the created viewpoint or None
        """
        id = token_hex(16)
        with self.rest(
            "POST",
            "/viewpoints",
            name="CreateViewpoint",
            json={
                "viewpoint_id": id,
                "viewpoint_name": "LocustUser-Viewpoint-" + id,
                "bucket_name": test_images_bucket,
                "object_key": test_image_key,
                "tile_size": tile_size,
                "range_adjustment": range_adjustment,
            },
        ) as response:
            if response.js is not None:
                if VIEWPOINT_ID not in response.js:
                    response.failure(f"'{VIEWPOINT_ID}' missing from response {response.text}")
                else:
                    return response.js[VIEWPOINT_ID]
        return None

    def wait_for_viewpoint_ready(self, viewpoint_id: str) -> str:
        """
        Waits for the viewpoint with specified ID to become ready.

        :param viewpoint_id: ID of the viewpoint to wait for
        :return: final status of the viewpoint
        """
        done = False
        num_retries = 120
        final_status = "NOT_FOUND"
        while not done and num_retries > 0:
            with self.rest("GET", f"/viewpoints/{viewpoint_id}", name="DescribeViewpoint") as response:
                if response.js is not None and VIEWPOINT_STATUS in response.js:
                    final_status = response.js[VIEWPOINT_STATUS]
                    if response.js[VIEWPOINT_STATUS] in ["READY", "FAILED", "DELETED"]:
                        done = True
                    else:
                        time.sleep(15)
                        num_retries -= 1
        if not done:
            response.failure(f"Gave up waiting for {viewpoint_id} to become ready. Final Status was {final_status}")

        return final_status

    def request_tiles(self, viewpoint_id: str, num_tiles: int = 100, batch_size: int = 5) -> None:
        """
        Requests tiles for the viewpoint with specified ID.

        :param viewpoint_id: ID of the viewpoint to request tiles for
        :param num_tiles: number of tiles to request
        :param batch_size: number of tiles to request in parallel
        :return: None
        """
        tile_format = "PNG"
        compression = "NONE"

        def concurrent_tile_request(tile: (int, int, int)):
            url = (
                f"/viewpoints/{viewpoint_id}/image/tiles/"
                f"{tile[2]}/{tile[0]}/{tile[1]}.{tile_format}?compression={compression}"
            )
            with self.client.get(url, name="GetTile") as response:
                if not response.content:
                    response.failure("GetTile response contained no content")

        for z in [3, 2, 1, 0]:
            num_tiles_at_zoom = ceil(num_tiles / (4**z))
            p = ceil(log(num_tiles_at_zoom) / (2 * log(2)))
            n = 2
            hilbert_curve = HilbertCurve(p, n)
            for i in range(0, num_tiles_at_zoom, batch_size):
                distances = list(range(i, min(i + batch_size, num_tiles_at_zoom)))
                tiles = [(p[0], p[1], z) for p in hilbert_curve.points_from_distances(distances)]
                pool = gevent.pool.Pool()
                for tile in tiles:
                    pool.spawn(concurrent_tile_request, tile)
                pool.join()

    def request_map_tiles(
        self, viewpoint_id: str, tile_matrix_set_id: str = "WebMercatorQuad", num_tiles: int = 100
    ) -> None:
        self.get_viewpoint_tilesets(viewpoint_id)

        tile_format = "PNG"
        compression = "NONE"

        parsed_tileset_limits = {}
        max_zoom_level = 0
        tileset_metadata = self.get_viewpoint_tileset_metadata(viewpoint_id, tile_matrix_set_id)
        for tile_matrix_limits in tileset_metadata["tileMatrixSetLimits"]:
            current_tile_matrix = int(tile_matrix_limits["tileMatrix"])
            max_zoom_level = max(max_zoom_level, current_tile_matrix)
            parsed_tileset_limits[current_tile_matrix] = (
                tile_matrix_limits["minTileRow"],
                tile_matrix_limits["minTileCol"],
                tile_matrix_limits["maxTileRow"],
                tile_matrix_limits["maxTileCol"],
            )

        def concurrent_tile_request(tile: (int, int, int)):
            url = (
                f"/viewpoints/{viewpoint_id}/map/tiles/"
                f"WebMercatorQuad/{tile[2]}/{tile[1]}/{tile[0]}.{tile_format}?compression={compression}"
            )
            with self.client.get(url, name="GetMapTile") as response:
                if not response.content:
                    response.failure("GetMapTile response contained no content")

        num_tiles_fetched = 0
        for zoom in range(0, max_zoom_level + 1):
            if zoom not in parsed_tileset_limits:
                # Skipping this zoom level because the tile limits haven't been specified
                continue

            min_ty, min_tx, max_ty, max_tx = parsed_tileset_limits[zoom]

            pool = gevent.pool.Pool()
            for ty in range(min_ty, max_ty + 1):
                for tx in range(min_tx, max_tx + 1):
                    if num_tiles_fetched >= num_tiles:
                        break
                    pool.spawn(concurrent_tile_request((tx, ty, zoom)))
                    num_tiles_fetched += 1
            pool.join()

    def cleanup_viewpoint(self, viewpoint_id: str) -> None:
        """
        Deletes the viewpoint with specified ID.

        :param viewpoint_id: ID of the viewpoint to delete
        """
        with self.rest("DELETE", f"/viewpoints/{viewpoint_id}", name="DeleteViewpoint") as response:
            if response.js is not None:
                if VIEWPOINT_STATUS not in response.js:
                    response.failure(f"'{VIEWPOINT_STATUS}' missing from response {response.text}")
                elif response.js[VIEWPOINT_STATUS] != "DELETED":
                    response.failure(f"Unexpected status after viewpoint delete {response.text}")

    def list_ready_viewpoints(self) -> List[str]:
        """
        Lists all ready viewpoints.

        :return: list of viewpoint IDs
        """
        result = []
        with self.rest("GET", "/viewpoints", name="ListViewpoints") as response:
            if response.js is not None:
                for viewpoint in response.js["items"]:
                    if (
                        VIEWPOINT_ID in viewpoint
                        and VIEWPOINT_STATUS in viewpoint
                        and viewpoint[VIEWPOINT_STATUS] == "READY"
                    ):
                        result.append(viewpoint[VIEWPOINT_ID])
        return result

    def get_viewpoint_metadata(self, viewpoint_id: str):
        """
        Fetches metadata for the viewpoint with specified ID.

        :param viewpoint_id: ID of the viewpoint to fetch metadata for
        """
        with self.rest("GET", f"/viewpoints/{viewpoint_id}/image/metadata", name="GetMetadata") as response:
            if response.status_code == 404 and "already been deleted" in response.js["detail"]:
                # It is possible the viewpoint was deleted between the call to list and this call. A 404 response may
                # be valid.
                response.success()
            elif response.js is not None and "metadata" not in response.js:
                response.failure(f"'metadata' missing from response {response.text}")

    def get_viewpoint_bounds(self, viewpoint_id: str):
        """
        Fetches bounds for the viewpoint with specified ID.

        :param viewpoint_id: ID of the viewpoint to fetch bounds for
        """
        with self.rest("GET", f"/viewpoints/{viewpoint_id}/image/bounds", name="GetBounds") as response:
            if response.status_code == 404 and "already been deleted" in response.js["detail"]:
                # It is possible the viewpoint was deleted between the call to list and this call. A 404 response may
                # be valid.
                response.success()
            elif response.js is not None and "bounds" not in response.js:
                response.failure(f"'bounds' missing from response {response.text}")

    def get_viewpoint_info(self, viewpoint_id: str) -> Optional[dict]:
        """
        Fetches info for the viewpoint with specified ID.

        :param viewpoint_id: ID of the viewpoint to fetch info for
        """
        with self.rest("GET", f"/viewpoints/{viewpoint_id}/image/info", name="GetInfo") as response:
            if response.status_code == 404 and "already been deleted" in response.js["detail"]:
                # It is possible the viewpoint was deleted between the call to list and this call. A 404 response may
                # be valid.
                response.success()
                return None
            elif response.js is not None and "features" not in response.js:
                response.failure(f"'features' missing from response {response.text}")
            else:
                return response.js

    def get_viewpoint_statistics(self, viewpoint_id: str):
        """
        Fetches statistics for the viewpoint with specified ID.

        :param viewpoint_id: ID of the viewpoint to fetch statistics for
        """
        with self.rest("GET", f"/viewpoints/{viewpoint_id}/image/statistics", name="GetStatistics") as response:
            if response.status_code == 404 and "already been deleted" in response.js["detail"]:
                # It is possible the viewpoint was deleted between the call to list and this call. A 404 response may
                # be valid.
                response.success()
            elif response.js is not None and "image_statistics" not in response.js:
                response.failure(f"'image_statistics' missing from response {response.text}")

    def get_viewpoint_preview(self, viewpoint_id: str):
        """
        Fetches preview for the viewpoint with specified ID.

        :param viewpoint_id: ID of the viewpoint to fetch preview for
        """
        tile_format = "PNG"
        with self.client.get(f"/viewpoints/{viewpoint_id}/image/preview.{tile_format}", name="GetPreview") as response:
            if response.status_code == 404 and "already been deleted" in response.js["detail"]:
                # It is possible the viewpoint was deleted between the call to list and this call. A 404 response may
                # be valid.
                response.success()
            elif not response.content:
                response.failure("GetPreview response contained no content")

    def get_viewpoint_tilesets(self, viewpoint_id: str):
        with self.rest("GET", f"/viewpoints/{viewpoint_id}/map/tiles", name="GetMapTilesets") as response:
            if response.status_code == 404 and "already been deleted" in response.js["detail"]:
                # It is possible the viewpoint was deleted between the call to list and this call. A 404 response may
                # be valid.
                response.success()
            elif not response.content:
                response.failure("GetMapTilesets response contained no content")

    def get_viewpoint_tileset_metadata(self, viewpoint_id: str, tile_matrix_set_id: str) -> Optional[dict]:
        with self.rest(
            "GET", f"/viewpoints/{viewpoint_id}/map/tiles/{tile_matrix_set_id}", name="GetMapTilesetMetadata"
        ) as response:
            if response.js is not None:
                response.success()
                return response.js
            else:
                response.failure("GetMapTileseetMetadata response contained no content")
                return None
