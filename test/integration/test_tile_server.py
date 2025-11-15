#  Copyright 2024-2025 Amazon.com, Inc. or its affiliates.

import logging
import traceback
from collections import Counter
from enum import Enum, auto
from time import sleep
from typing import Dict

from requests import Session

from .endpoints import (
    create_viewpoint,
    create_viewpoint_invalid,
    create_viewpoint_invalid_id,
    delete_viewpoint,
    delete_viewpoint_invalid,
    describe_viewpoint,
    get_bounds,
    get_crop,
    get_info,
    get_map_tile,
    get_map_tileset_metadata,
    get_map_tilesets,
    get_metadata,
    get_preview,
    get_statistics,
    get_statistics_invalid,
    get_tile,
    list_viewpoints,
    update_viewpoint,
)
from .test_config import TileServerIntegTestConfig


class AutoStringEnum(Enum):
    """
    A class used to represent an Enum where the value of the Enum member is the same as the name of the Enum member.
    """

    @staticmethod
    def _generate_next_value_(name, start, count, last_values) -> str:
        """
        Function to iterate through the Enum members.

        :param: name: Name of the Enum member.
        :param: start: Initial integer to start with.
        :param: count: Number of existing members.
        :param: last_values: List of values for existing members.

        :return: The next value of the enumeration which is the same as the name.
        """
        return name


class TestResult(str, AutoStringEnum):
    """
    Provides enumeration of test result.

    :cvar PASSED: Test passed.
    :cvar FAILED: Test failed.
    """

    PASSED = auto()
    FAILED = auto()


class TestTileServer:
    def __init__(self, test_config: TileServerIntegTestConfig):
        self.config: TileServerIntegTestConfig = test_config
        self.session: Session = Session()
        self.viewpoint_id = None
        self.test_results = {}
        self.viewpoints_url = f"{self.config.endpoint}/viewpoints"

    def run_integ_test(self) -> None:
        logging.info("Running Tile Server integration tests")
        self.test_create_viewpoint()
        self.test_describe_viewpoint()
        self.wait_for_viewpoint_ready()
        self.test_list_viewpoints()
        self.test_update_viewpoint()
        self.test_get_metadata()
        self.test_get_bounds()
        self.test_get_info()
        self.test_get_statistics()
        self.test_get_preview()
        self.test_get_tile()
        self.test_get_crop()
        self.test_get_map_tilesets()
        self.test_get_map_tileset_metadata()
        self.test_get_map_tile()
        self.test_delete_viewpoint()
        test_summary = self._pretty_print_test_results(self.test_results)
        if TestResult.FAILED in [res["result"] for res in self.test_results.values()]:
            raise Exception(test_summary)
        logging.info(test_summary)

    def wait_for_viewpoint_ready(self) -> None:
        polling_interval_sec = 2
        timeout_sec = 300
        elapsed_wait_time = 0
        logging.info("Waiting for viewpoint status to be READY")
        status = "REQUESTED"
        while status == "REQUESTED":
            if elapsed_wait_time > timeout_sec:
                raise Exception(f"Test timed out waiting for viewpoint to be READY after {elapsed_wait_time} seconds.")
            res = self.session.get(f"{self.viewpoints_url}/{self.viewpoint_id}")
            res.raise_for_status()
            status = res.json().get("viewpoint_status")
            logging.info("...")
            sleep(polling_interval_sec)
            elapsed_wait_time += polling_interval_sec
        if status != "READY":
            raise Exception(f"Viewpoint status is {status}. Expected READY")

    def test_create_viewpoint(self) -> None:
        try:
            logging.info("Test create invalid viewpoint")
            create_viewpoint_invalid(self.session, self.viewpoints_url, self.config.invalid_viewpoint)
            self.test_results["Create Viewpoint - Invalid"] = {"result": TestResult.PASSED}
        except Exception as err:
            logging.info(f"\tFailed. {err}")
            logging.error(traceback.print_exception(err))
            self.test_results["Create Viewpoint - Invalid"] = {
                "result": TestResult.FAILED,
                "message": self._get_exception_summary(err),
            }
        try:
            logging.info("Test create invalid viewpoint ID")
            viewpoint_with_invalid_id = self.config.test_viewpoint.copy()
            viewpoint_with_invalid_id["viewpoint_id"] = "tricky/id"
            create_viewpoint_invalid_id(self.session, self.viewpoints_url, viewpoint_with_invalid_id)
            self.test_results["Create Viewpoint - Invalid ID"] = {"result": TestResult.PASSED}
        except Exception as err:
            logging.info(f"\tFailed. {err}")
            logging.error(traceback.print_exception(err))
            self.test_results["Create Viewpoint - Invalid ID"] = {
                "result": TestResult.FAILED,
                "message": self._get_exception_summary(err),
            }
        try:
            logging.info("Test create viewpoint")
            self.viewpoint_id = create_viewpoint(self.session, self.viewpoints_url, self.config.test_viewpoint)
            self.test_results["Create Viewpoint"] = {"result": TestResult.PASSED}
        except Exception as err:
            logging.info(f"\tFailed. {err}")
            logging.error(traceback.print_exception(err))
            self.test_results["Create Viewpoint"] = {
                "result": TestResult.FAILED,
                "message": self._get_exception_summary(err),
            }

    def test_describe_viewpoint(self) -> None:
        try:
            logging.info("Test describe viewpoint")
            describe_viewpoint(self.session, self.viewpoints_url, self.viewpoint_id)
            self.test_results["Describe Viewpoint"] = {"result": TestResult.PASSED}
        except Exception as err:
            logging.info(f"\tFailed. {err}")
            logging.error(traceback.print_exception(err))
            self.test_results["Describe Viewpoint"] = {
                "result": TestResult.FAILED,
                "message": self._get_exception_summary(err),
            }

    def test_list_viewpoints(self) -> None:
        try:
            logging.info("Test list viewpoints")
            list_viewpoints(self.session, self.viewpoints_url)
            self.test_results["List Viewpoints"] = {"result": TestResult.PASSED}
        except Exception as err:
            logging.info(f"\tFailed. {err}")
            logging.error(traceback.print_exception(err))
            self.test_results["List Viewpoints"] = {"result": TestResult.FAILED, "message": self._get_exception_summary(err)}

    def test_update_viewpoint(self) -> None:
        try:
            logging.info("Test update viewpoint")
            update_viewpoint(self.session, self.viewpoints_url, self.viewpoint_id, self.config.valid_update_test_body)
            self.test_results["Update Viewpoint"] = {"result": TestResult.PASSED}
        except Exception as err:
            logging.info(f"\tFailed. {err}")
            logging.error(traceback.print_exception(err))
            self.test_results["Update Viewpoint"] = {
                "result": TestResult.FAILED,
                "message": self._get_exception_summary(err),
            }

    def test_get_metadata(self) -> None:
        try:
            logging.info("Test get metadata")
            get_metadata(self.session, self.viewpoints_url, self.viewpoint_id)
            self.test_results["Get Metadata"] = {"result": TestResult.PASSED}
        except Exception as err:
            logging.info(f"\tFailed. {err}")
            logging.error(traceback.print_exception(err))
            self.test_results["Get Metadata"] = {"result": TestResult.FAILED, "message": self._get_exception_summary(err)}

    def test_get_bounds(self) -> None:
        try:
            logging.info("Test get bounds")
            get_bounds(self.session, self.viewpoints_url, self.viewpoint_id)
            self.test_results["Get Bounds"] = {"result": TestResult.PASSED}
        except Exception as err:
            logging.info(f"\tFailed. {err}")
            logging.error(traceback.print_exception(err))
            self.test_results["Get Bounds"] = {"result": TestResult.FAILED, "message": self._get_exception_summary(err)}

    def test_get_info(self) -> None:
        try:
            logging.info("Test get info")
            get_info(self.session, self.viewpoints_url, self.viewpoint_id)
            self.test_results["Get Info"] = {"result": TestResult.PASSED}
        except Exception as err:
            logging.info(f"\tFailed. {err}")
            logging.error(traceback.print_exception(err))
            self.test_results["Get Info"] = {"result": TestResult.FAILED, "message": self._get_exception_summary(err)}

    def test_get_statistics(self) -> None:
        try:
            logging.info("Test get statistics")
            get_statistics(self.session, self.viewpoints_url, self.viewpoint_id)
            self.test_results["Get Statistics"] = {"result": TestResult.PASSED}
        except Exception as err:
            logging.info(f"\tFailed. {err}")
            logging.error(traceback.print_exception(err))
            self.test_results["Get Statistics"] = {"result": TestResult.FAILED, "message": self._get_exception_summary(err)}

        try:
            logging.info("Test get statistics invalid")
            get_statistics_invalid(self.session, self.viewpoints_url, self.viewpoint_id)
            self.test_results["Get Statistics - Invalid"] = {"result": TestResult.PASSED}
        except Exception as err:
            logging.info(f"\tFailed. {err}")
            logging.error(traceback.print_exception(err))
            self.test_results["Get Statistics - Invalid"] = {
                "result": TestResult.FAILED,
                "message": self._get_exception_summary(err),
            }

    def test_get_preview(self) -> None:
        try:
            logging.info("Test get preview")
            get_preview(self.session, self.viewpoints_url, self.viewpoint_id)
            self.test_results["Get Preview"] = {"result": TestResult.PASSED}
        except Exception as err:
            logging.info(f"\tFailed. {err}")
            logging.error(traceback.print_exception(err))
            self.test_results["Get Preview"] = {"result": TestResult.FAILED, "message": self._get_exception_summary(err)}

    def test_get_tile(self) -> None:
        try:
            logging.info("Test get tile")
            get_tile(self.session, self.viewpoints_url, self.viewpoint_id)
            self.test_results["Get Tile"] = {"result": TestResult.PASSED}
        except Exception as err:
            logging.info(f"\tFailed. {err}")
            logging.error(traceback.print_exception(err))
            self.test_results["Get Tile"] = {"result": TestResult.FAILED, "message": self._get_exception_summary(err)}

    def test_get_crop(self) -> None:
        try:
            logging.info("Test get crop")
            get_crop(self.session, self.viewpoints_url, self.viewpoint_id)
            self.test_results["Get Crop"] = {"result": TestResult.PASSED}
        except Exception as err:
            logging.info(f"\tFailed. {err}")
            logging.error(traceback.print_exception(err))
            self.test_results["Get Crop"] = {"result": TestResult.FAILED, "message": self._get_exception_summary(err)}

    def test_get_map_tilesets(self) -> None:
        try:
            logging.info("Test get map tilesets")
            get_map_tilesets(self.session, self.viewpoints_url, self.viewpoint_id)
            self.test_results["Get Map Tilesets"] = {"result": TestResult.PASSED}
        except Exception as err:
            logging.info(f"\tFailed. {err}")
            logging.error(traceback.print_exception(err))
            self.test_results["Get Map Tilesets"] = {
                "result": TestResult.FAILED,
                "message": self._get_exception_summary(err),
            }

    def test_get_map_tileset_metadata(self) -> None:
        try:
            logging.info("Test get map tileset metadata")
            get_map_tileset_metadata(self.session, self.viewpoints_url, self.viewpoint_id, "WebMercatorQuad")
            self.test_results["Get Map Tileset Metadata"] = {"result": TestResult.PASSED}
        except Exception as err:
            logging.info(f"\tFailed. {err}")
            logging.error(traceback.print_exception(err))
            self.test_results["Get Map Tileset Metadata"] = {
                "result": TestResult.FAILED,
                "message": self._get_exception_summary(err),
            }

    def test_get_map_tile(self) -> None:
        try:
            logging.info("Test get map tile")
            get_map_tile(self.session, self.viewpoints_url, self.viewpoint_id)
            self.test_results["Get Map Tile"] = {"result": TestResult.PASSED}
        except Exception as err:
            logging.info(f"\tFailed. {err}")
            logging.error(traceback.print_exception(err))
            self.test_results["Get Map Tile"] = {"result": TestResult.FAILED, "message": self._get_exception_summary(err)}

    def test_delete_viewpoint(self) -> None:
        try:
            logging.info("Test delete viewpoint")
            delete_viewpoint(self.session, self.viewpoints_url, self.viewpoint_id)
            self.test_results["Delete Viewpoint"] = {"result": TestResult.PASSED}
        except Exception as err:
            logging.info(f"\tFailed. {err}")
            logging.error(traceback.print_exception(err))
            self.test_results["Delete Viewpoint"] = {
                "result": TestResult.FAILED,
                "message": self._get_exception_summary(err),
            }
        try:
            logging.info("Test delete viewpoint invalid")  # viewpoint already deleted
            delete_viewpoint_invalid(self.session, self.viewpoints_url, self.viewpoint_id)
            self.test_results["Delete Viewpoint - Invalid"] = {"result": TestResult.PASSED}
        except Exception as err:
            logging.info(f"\tFailed. {err}")
            logging.error(traceback.print_exception(err))
            self.test_results["Delete Viewpoint - Invalid"] = {
                "result": TestResult.FAILED,
                "message": self._get_exception_summary(err),
            }

    @staticmethod
    def _pretty_print_test_results(test_results: Dict[str, TestResult]) -> str:
        max_key_length = max([len(k) for k in test_results.keys()])
        sorted_results = dict(sorted(test_results.items(), key=lambda x: x[0].lower()))
        test_counter = Counter([res["result"] for res in test_results.values()])
        results_str = "\nTest Summary\n-------------------------------------\n"
        for k, v in sorted_results.items():
            result = v["result"]
            if result is TestResult.PASSED:
                results_str += f"{k.ljust(max_key_length + 5)}{result.value}\n"
            elif result is TestResult.FAILED:
                results_str += f"{k.ljust(max_key_length + 5)}{result.value} - {v['message']}\n"
        n_tests = len(test_results)
        passed = test_counter[TestResult.PASSED]
        failed = test_counter[TestResult.FAILED]
        success = passed / n_tests * 100
        results_str += f"    Tests: {n_tests}, Passed: {passed}, Failed: {failed}, Success: {success:.2f}%"
        return results_str

    @staticmethod
    def _get_exception_summary(err: Exception) -> str:
        tb = traceback.extract_tb(err.__traceback__)
        err_name = type(err).__name__
        location = f"...{tb[-1].filename.split('src/aws/osml/')[-1]}, {tb[-1].name}, line {tb[-1].lineno}"
        return f"{err_name}:{str(err)} in {location}: {tb[-1].line}"
