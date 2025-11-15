#  Copyright 2024-2025 Amazon.com, Inc. or its affiliates.

from typing import TYPE_CHECKING

from requests import Session

from ..test_assertions import with_expect

if TYPE_CHECKING:
    from ..test_assertions import expect


@with_expect
def list_viewpoints(session: Session, url: str) -> None:
    """
    Test Case: Successfully get the list of the viewpoints

    :param session: Requests session to use to send the request.
    :param url: URL to send the request to.

    return: None
    """
    res = session.get(url)
    res.raise_for_status()

    response_data = res.json()

    expect("Status code").equals(res.status_code, 200)
    expect("Viewpoints list not empty").equals(len(response_data["items"]) > 0, True)
