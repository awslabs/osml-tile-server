#  Copyright 2024-2025 Amazon.com, Inc. or its affiliates.

from typing import TYPE_CHECKING, Any, Dict

from requests import Session

from ..test_assertions import with_expect

if TYPE_CHECKING:
    from ..test_assertions import expect


@with_expect
def create_viewpoint(session: Session, url: str, test_body_data: Dict[str, Any]) -> str:
    """
    Test Case: Successfully create a viewpoint

    :param session: Requests session to use to send the request.
    :param url: URL to send the request to.
    :param test_body_data: Test body data to pass through POST http method.

    return str: Viewpoint_id or the created viewpoint
    """
    res = session.post(url, json=test_body_data)
    res.raise_for_status()
    expect("Status code").equals(res.status_code, 201)
    response_data = res.json()
    expect("Viewpoint ID").equals(response_data.get("viewpoint_id"), test_body_data["viewpoint_id"])
    expect("Viewpoint status").equals(response_data.get("viewpoint_status"), "REQUESTED")
    return response_data["viewpoint_id"]


@with_expect
def create_viewpoint_invalid(session: Session, url: str, test_body_data: Dict[str, Any]) -> None:
    """
    Test Case: Failed to create a viewpoint

    :param test_body_data: Test body data to pass through POST http method

    return: None
    """
    res = session.post(url, json=test_body_data)

    response_data = res.json()
    expect("Status code").equals(res.status_code, 422)
    # Pydantic v2 returns validation errors as a list in the detail field
    # Find the error for bucket_name field specifically
    detail = response_data.get("detail", [])
    if not isinstance(detail, list) or len(detail) == 0:
        raise AssertionError(f"Expected detail to be a non-empty list, got: {detail}")

    # Find the error for bucket_name field
    bucket_name_error = next(
        (err for err in detail if isinstance(err, dict) and "bucket_name" in err.get("loc", [])),
        detail[0],  # Fallback to first error if bucket_name error not found
    )
    error_msg = bucket_name_error.get("msg", "")
    # Pydantic v2 error message for None value in required string field
    # The message should contain "Input should be a valid string"
    expect("Validation message contains expected text").equals("Input should be a valid string" in error_msg, True)


@with_expect
def create_viewpoint_invalid_id(session: Session, url: str, test_body_data: Dict[str, Any]) -> None:
    """
    Test Case: Failed to create a viewpoint

    :param test_body_data: Test body data to pass through POST http method

    return: None
    """
    res = session.post(url, json=test_body_data)

    response_data = res.json()
    expect("Status code").equals(res.status_code, 422)
    expect("Error detail").equals(
        response_data["detail"], "Invalid viewpoint_id: must not contain whitespace and be URL safe."
    )
