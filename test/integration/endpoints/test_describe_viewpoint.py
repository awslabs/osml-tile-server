#  Copyright 2024-2025 Amazon.com, Inc. or its affiliates.

from typing import TYPE_CHECKING

from requests import Session

from ..test_assertions import with_expect

if TYPE_CHECKING:
    from ..test_assertions import expect


@with_expect
def describe_viewpoint(session: Session, url: str, viewpoint_id: str) -> None:
    """
    Test Case: Successfully describe a viewpoint

    :param session: Requests session to use to send the request.
    :param url: URL to send the request to.
    :param viewpoint_id: Unique viewpoint id to get from the table.

    return: None
    """
    res = session.get(f"{url}/{viewpoint_id}")
    res.raise_for_status()

    response_data = res.json()

    expect("Status code").equals(res.status_code, 200)
    expect("Viewpoint ID").equals(response_data["viewpoint_id"], viewpoint_id)
    expect("Viewpoint status not deleted").equals(response_data["viewpoint_status"] != "DELETED", True)


@with_expect
def describe_viewpoint_invalid(session: Session, url: str, viewpoint_id: str) -> None:
    """
    Test Case: Failed to describe a viewpoint

    :param session: Requests session to use to send the request.
    :param url: URL to send the request to.
    :param viewpoint_id: Unique viewpoint id to get from the table.

    return: None
    """
    res = session.get(f"{url}/{viewpoint_id}")

    response_data = res.json()

    expect("Status code").equals(res.status_code, 500)
    expect("Error message").equals("Invalid Key, it does not exist in ViewpointStatusTable" in response_data["detail"], True)
