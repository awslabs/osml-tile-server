#  Copyright 2024-2025 Amazon.com, Inc. or its affiliates.

import logging
import subprocess


def run_load_test(locust_run_time: str = "") -> None:
    log_run_config = f"for {locust_run_time}" if locust_run_time else "UI on http://localhost:8089"
    logging.info(f"Running Tile Server locust load test {log_run_config}")

    child_process = subprocess.Popen("locust", stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    with child_process.stdout:
        for line in iter(child_process.stdout.readline, b"\n"):
            logging.info(line)
    locust_exit_code = child_process.returncode
    if locust_exit_code:
        raise RuntimeError(f"Exit code: {locust_exit_code}.")
    else:
        logging.info(f"Load test succeeded with exit code: {locust_exit_code}.")
