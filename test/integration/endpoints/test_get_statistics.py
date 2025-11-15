#  Copyright 2024-2025 Amazon.com, Inc. or its affiliates.

from typing import TYPE_CHECKING

from requests import Session

from ..test_assertions import with_expect

if TYPE_CHECKING:
    from ..test_assertions import expect


@with_expect
def get_statistics(session: Session, url: str, viewpoint_id: str) -> None:
    """
    Test Case: Successfully get the statistics of the viewpoint

    :param session: Requests session to use to send the request.
    :param url: URL to send the request to.
    :param viewpoint_id: Unique viewpoint id to get from the table.

    return: None
    """
    res = session.get(f"{url}/{viewpoint_id}/image/statistics")
    res.raise_for_status()

    response_data = res.json()

    expect("Status code").equals(res.status_code, 200)
    expect("GeoTransform data").equals(response_data["image_statistics"]["geoTransform"] is not None, True)
    expect("Corner coordinates data").equals(response_data["image_statistics"]["cornerCoordinates"] is not None, True)
    expect("Bands data").equals(response_data["image_statistics"]["bands"] is not None, True)


@with_expect
def get_statistics_invalid(session: Session, url: str, viewpoint_id: str) -> None:
    """
    Test Case: Failed to get the statistics of the viewpoint

    :param session: Requests session to use to send the request.
    :param url: URL to send the request to.
    :param viewpoint_id: Unique viewpoint id to get from the table.

    return: None
    """
    res = session.get(f"{url}/{viewpoint_id}-invalid/image/statistics")

    response_data = res.json()

    expect("Status code").equals(res.status_code, 404)
    expect("Error message").equals(" not found." in response_data["detail"], True)
