#  Copyright 2023-2025 Amazon.com, Inc. or its affiliates.

import contextvars
import logging
from typing import List, Optional

from pythonjsonlogger.jsonlogger import JsonFormatter

_LOG_CONTEXT = contextvars.ContextVar("_LOG_CONTEXT", default={})


class AsyncContextFilter(logging.Filter):
    """
    This is a filter that injects contextual information into the log message. The contextual information is
    set using the static methods of this class.
    """

    def __init__(self, attribute_names: List[str]) -> None:
        super().__init__()
        self.attribute_names = attribute_names

    def filter(self, record: logging.LogRecord) -> bool:
        """
        This method is called for each log record. It injects the contextual information into the log record.

        :param record: the log record to filter
        :return: True, this filter does not exclude information from the log
        """
        context = _LOG_CONTEXT.get()
        for attribute_name in self.attribute_names:
            setattr(record, attribute_name, context.get(attribute_name, None))
        return True

    @staticmethod
    def set_context(context: Optional[dict]) -> None:
        """
        Set the context for the current coroutine. If None, all context information is cleared.

        :param context: dict = the context to set
        :return: None
        """
        if context is None:
            _LOG_CONTEXT.set({})
        else:
            _LOG_CONTEXT.set(context)


def configure_logger(
    logger: logging.Logger, log_level: int, log_formatter: logging.Formatter = None, log_filter: logging.Filter = None
) -> logging.Logger:
    """
    Configure a given logger with the provided parameters.

    :param logger: An instance of the Logger to configure
    :param log_level: The log level to set
    :param log_formatter: The log formatter to set on all handlers
    :param log_filter: Log filter to apply to the logger

    :return: None
    """
    logger.setLevel(log_level)

    stream_handler_exists = any(isinstance(handler, logging.StreamHandler) for handler in logger.handlers)

    if not stream_handler_exists:
        stream_handler = logging.StreamHandler()
        logger.addHandler(stream_handler)

    for handler in logger.handlers:
        handler.setFormatter(log_formatter)

    if log_filter:
        logger.addFilter(log_filter)

    logger.propagate = False

    return logger


def get_logger(name: str = __name__, level: int = logging.INFO) -> logging.Logger:
    """
    Configures the logging setup for AWS Lambda.

    :param name: The name of the logger.
    :param level: The logging level to be used if no other handler is already configured. Default is INFO.

    :returns: The configured logger instance.
    """
    lambda_logger = logging.getLogger(name)
    root_logger = logging.getLogger()

    # Check if the root logger already has any handlers
    if root_logger.hasHandlers():
        root_logger.setLevel(level)
    else:
        logging.basicConfig(level=level)

    return lambda_logger


formatter = JsonFormatter(fmt="%(asctime)s %(name)s %(levelname)s %(image_hash)s %(message)s", datefmt="%Y-%m-%dT%H:%M:%S")

filter = AsyncContextFilter(attribute_names=["image_hash"])

logger = configure_logger(logger=get_logger(), log_level=logging.INFO, log_formatter=formatter, log_filter=filter)
