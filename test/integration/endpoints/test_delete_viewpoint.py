#  Copyright 2024-2025 Amazon.com, Inc. or its affiliates.

from typing import TYPE_CHECKING

from requests import Session

from ..test_assertions import with_expect

if TYPE_CHECKING:
    from ..test_assertions import expect


@with_expect
def delete_viewpoint(session: Session, url: str, viewpoint_id: str) -> None:
    """
    Test Case: Successfully delete the viewpoint

    :param session: Requests session to use to send the request.
    :param url: URL to send the request to.
    :param viewpoint_id: Unique viewpoint id to get from the table.

    return: None
    """
    res = session.delete(f"{url}/{viewpoint_id}")
    res.raise_for_status()

    expect("Status code").equals(res.status_code, 204)


@with_expect
def delete_viewpoint_invalid(session: Session, url: str, viewpoint_id: str) -> None:
    """
    Test Case: Failed to delete the viewpoint

    :param session: Requests session to use to send the request.
    :param url: URL to send the request to.
    :param viewpoint_id: Unique viewpoint id to get from the table.

    return: None
    """
    res = session.delete(f"{url}/{viewpoint_id}")

    response_data = res.json()

    expect("Status code").equals(res.status_code, 404)
    expect("Error message").equals(f"viewpoint_id {viewpoint_id} not found." in response_data["detail"], True)
