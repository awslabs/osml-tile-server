#  Copyright 2024-2025 Amazon.com, Inc. or its affiliates.

import os
from urllib.parse import urlparse


class S3Url:
    """
    A class to parse and represent an S3 URL.

    :param url: The S3 URL to be parsed.
    """

    def __init__(self, url: str) -> None:
        """
        Initialize an S3Url instance.

        :param url: The S3 URL to be parsed.
        """
        self._parsed = urlparse(url, allow_fragments=False)

    @property
    def bucket(self) -> str:
        """
        Get the bucket name from the parsed URL.

        :return: The bucket name.
        """
        return self._parsed.netloc

    @property
    def key(self) -> str:
        """
        Get the object key from the parsed URL.

        :return: The object key.
        """
        if self._parsed.query:
            return self._parsed.path.lstrip("/") + "?" + self._parsed.query
        else:
            return self._parsed.path.lstrip("/")

    @property
    def url(self) -> str:
        """
        Get the full URL as a string.

        :return: The full URL.
        """
        return self._parsed.geturl()

    @property
    def prefix(self) -> str:
        """
        Get the prefix (directory path) from the S3 key, excluding the file name and extension.

        :return: The prefix.
        """
        return os.path.dirname(self.key)

    @property
    def filename(self) -> str:
        """
        Get the filename with extension from the S3 key.

        :return: The filename with extension.
        """
        return os.path.basename(self.key)
