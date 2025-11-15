#  Copyright 2024-2025 Amazon.com, Inc. or its affiliates.

import json
import traceback
from abc import ABC, abstractmethod
from typing import Any, Dict

from .utils import logger


class ProcessorBase(ABC):
    """
    A base class providing common success and failure message handling for processors.
    """

    @staticmethod
    def success_message(message: str) -> Dict[str, Any]:
        """
        Returns a success message in the form of a dictionary, intended for an HTTP response.

        :param message: The success message to send when complete.
        :returns: A dictionary with 'statusCode' set to 200 and a 'body' containing a success message.
        """
        logger.info(message)
        return {"statusCode": 200, "body": json.dumps(message)}

    @staticmethod
    def failure_message(err: Exception) -> Dict[str, Any]:
        """
        Returns an error message in the form of a dictionary, including a stack trace, intended for an HTTP response.

        :param err: The exception that triggered the failure.
        :returns: A dictionary with 'statusCode' set to 500 and a 'body' containing the error message and stack trace.
        """
        stack_trace = traceback.format_exc()
        logger.error(err)

        # Return the error message and stack trace in the response
        error_response = {"message": str(err), "stack_trace": stack_trace.splitlines()}
        return {"statusCode": 500, "body": json.dumps(error_response)}

    @abstractmethod
    def process(self) -> Dict[str, Any]:
        """
        Process the incoming message. This method must be implemented by all subclasses.

        :returns: A response indicating the status of the process.
        """
        pass
