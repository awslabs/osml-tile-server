#  Copyright 2024-2025 Amazon.com, Inc. or its affiliates.

from typing import TYPE_CHECKING

from requests import Session

from ..test_assertions import with_expect

if TYPE_CHECKING:
    from ..test_assertions import expect


@with_expect
def get_metadata(session: Session, url: str, viewpoint_id: str) -> None:
    """
    Test Case: Successfully get the metadata of the viewpoint

    :param session: Requests session to use to send the request.
    :param url: URL to send the request to.
    :param viewpoint_id: Unique viewpoint id to get from the table.

    return: None
    """
    res = session.get(f"{url}/{viewpoint_id}/image/metadata")
    res.raise_for_status()

    response_data = res.json()

    expect("Status code").equals(res.status_code, 200)
    expect("Metadata field present").equals("metadata" in response_data, True)


@with_expect
def get_metadata_invalid(session: Session, url: str, viewpoint_id: str) -> None:
    """
    Test Case: Failed to get the metadata of the viewpoint

    :param session: Requests session to use to send the request.
    :param url: URL to send the request to.
    :param viewpoint_id: Unique viewpoint id to get from the table.

    return: None
    """
    res = session.get(f"{url}/{viewpoint_id}/image/metadata")

    response_data = res.json()

    expect("Status code").equals(res.status_code, 404)
    expect("Error message").equals(
        "Cannot view ViewpointApiNames.METADATA for this image since this has already been deleted."
        in response_data["detail"],
        True,
    )
