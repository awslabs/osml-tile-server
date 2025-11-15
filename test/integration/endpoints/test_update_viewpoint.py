#  Copyright 2024-2025 Amazon.com, Inc. or its affiliates.

from typing import TYPE_CHECKING, Any, Dict

from requests import Session

from ..test_assertions import with_expect

if TYPE_CHECKING:
    from ..test_assertions import expect


@with_expect
def update_viewpoint(session: Session, url: str, viewpoint_id: str, test_body_data: Dict[str, Any]) -> None:
    """
    Test Case: Successfully update the viewpoint

    :param session: Requests session to use to send the request.
    :param url: URL to send the request to.
    :param viewpoint_id: Unique viewpoint id to get from the table.
    :param test_body_data: Test body data to pass through POST http method

    return: None
    """
    update_viewpoint_id = test_body_data
    update_viewpoint_id["viewpoint_id"] = viewpoint_id

    res = session.put(f"{url}", json=test_body_data)
    res.raise_for_status()

    response_data = res.json()

    expect("Status code").equals(res.status_code, 201)
    expect("Viewpoint name").equals(response_data["viewpoint_name"], test_body_data["viewpoint_name"])


@with_expect
def update_viewpoint_invalid_deleted(session: Session, url: str, viewpoint_id: str, test_body_data: Dict[str, Any]) -> None:
    """
    Test Case: Failed to update the viewpoint

    :param session: Requests session to use to send the request.
    :param url: URL to send the request to.
    :param viewpoint_id: Unique viewpoint id to get from the table.
    :param test_body_data: Test body data to pass through POST http method

    return: None
    """
    update_viewpoint_id = test_body_data
    update_viewpoint_id["viewpoint_id"] = viewpoint_id

    res = session.put(f"{url}", json=test_body_data)

    response_data = res.json()

    expect("Status code").equals(res.status_code, 404)
    expect("Error message").equals(
        "Cannot view ViewpointApiNames.UPDATE for this image since this has already been deleted."
        in response_data["detail"],
        True,
    )


@with_expect
def update_viewpoint_invalid_missing_field(
    session: Session, url: str, viewpoint_id: str, test_body_data: Dict[str, Any]
) -> None:
    """
    Test Case: Failed to update the viewpoint

    :param session: Requests session to use to send the request.
    :param url: URL to send the request to.
    :param viewpoint_id: Unique viewpoint id to get from the table.
    :param test_body_data: Test body data to pass through POST http method

    return: None
    """
    update_viewpoint_id = test_body_data
    update_viewpoint_id["viewpoint_id"] = viewpoint_id

    res = session.put(f"{url}", json=test_body_data)

    response_data = res.json()

    expect("Status code").equals(res.status_code, 422)
    expect("Validation message").equals(response_data["detail"][0]["msg"], "Field required")
