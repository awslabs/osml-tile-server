#  Copyright 2024-2025 Amazon.com, Inc. or its affiliates.

from typing import TYPE_CHECKING

from requests import Session

from ..test_assertions import with_expect

if TYPE_CHECKING:
    from ..test_assertions import expect


@with_expect
def get_map_tilesets(session: Session, url: str, viewpoint_id: str) -> None:
    """
    Test Case: Successfully get a list of tilesets supported by a viewpoint

    :param session: Requests session to use to send the request.
    :param url: URL to send the request to.
    :param viewpoint_id: Unique viewpoint id to get from the table.

    return: None
    """
    res = session.get(f"{url}/{viewpoint_id}/map/tiles")
    res.raise_for_status()

    expect("Status code").equals(res.status_code, 200)
    expect("Content type").equals(res.headers.get("content-type"), "application/json")


@with_expect
def get_map_tileset_metadata(session: Session, url: str, viewpoint_id: str, tileset_id: str) -> None:
    """
    Test Case: Successfully get a the metadata for a tileset

    :param session: Requests session to use to send the request.
    :param url: URL to send the request to.
    :param viewpoint_id: Unique viewpoint id to get from the table.
    :param tileset_id: ID of the tileset to get metadata for

    return: None
    """
    res = session.get(f"{url}/{viewpoint_id}/map/tiles/{tileset_id}")
    res.raise_for_status()

    expect("Status code").equals(res.status_code, 200)
    expect("Content type").equals(res.headers.get("content-type"), "application/json")


@with_expect
def get_map_tile(session: Session, url: str, viewpoint_id: str) -> None:
    """
    Test Case: Successfully get a map tile of the viewpoint

    :param session: Requests session to use to send the request.
    :param url: URL to send the request to.
    :param viewpoint_id: Unique viewpoint id to get from the table.

    return: None
    """
    res = session.get(f"{url}/{viewpoint_id}/map/tiles/WebMercatorQuad/0/0/0.PNG")
    res.raise_for_status()

    expect("Status code").equals(res.status_code, 200)
    expect("Content type").equals(res.headers.get("content-type"), "image/png")
