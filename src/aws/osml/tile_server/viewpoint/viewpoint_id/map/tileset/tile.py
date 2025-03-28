#  Copyright 2024-2026 Amazon.com, Inc. or its affiliates.

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response, status

from aws.osml.gdal import GDALCompressionOptions, GDALImageFormats
from aws.osml.tile_server.app_config import ServerConfig
from aws.osml.tile_server.models import ViewpointApiNames, validate_viewpoint_status
from aws.osml.tile_server.services import get_aws_services, get_tile_provider
from aws.osml.tile_server.utils import get_media_type


def _invert_tile_row_index(tile_row: int, tile_matrix: int) -> int:
    return 2**tile_matrix - 1 - tile_row


tile_matrix_router = APIRouter(
    prefix="/{tile_matrix}",
    tags=["map"],
    dependencies=[],
    responses={status.HTTP_404_NOT_FOUND: {"description": "Not found!"}},
)


@tile_matrix_router.get("/{tile_row}/{tile_col}.{tile_format}")
def get_map_tile(
    aws: Annotated[get_aws_services, Depends()],
    tile_provider: Annotated[get_tile_provider, Depends()],
    viewpoint_id: str,
    tile_matrix_set_id: str,
    tile_matrix: int,
    tile_row: int,
    tile_col: int,
    tile_format: GDALImageFormats = Path(description="Output image type."),
    compression: GDALCompressionOptions = Query(GDALCompressionOptions.NONE, description="Compression Algorithm for image."),
    invert_y: bool = Query(False, description="Invert the TMS tile y-index."),
) -> Response:
    """
    Create a tile by warping the image into an orthophoto and clipping it at the appropriate resolution/bounds
    for the requested tile. This endpoint conforms to the OGC API - Tiles specification.

    :param aws: Injected AWS services.
    :param tile_provider: Injected tile provider.
    :param viewpoint_id: The viewpoint id.
    :param tile_matrix_set_id: The name of the tile matrix set (e.g. WebMercatorQuad).
    :param tile_matrix: The zoom level or tile matrix it.
    :param tile_row: The tile row in the tile matrix.
    :param tile_col: The tile column in the tile matrix.
    :param tile_format: The desired output format.
    :param compression: The desired compression.
    :param invert_y: Whether to invert the tile y index.
    :return: A Response binary image containing the map tile created from this viewpoint.
    """
    if tile_matrix < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Resolution Level for get tile request must be >= 0. Requested z={tile_matrix}",
        )
    if invert_y:
        tile_row = _invert_tile_row_index(tile_row, tile_matrix)
    try:
        viewpoint_item = aws.viewpoint_database.get_viewpoint(viewpoint_id)
        validate_viewpoint_status(viewpoint_item.viewpoint_status, ViewpointApiNames.TILE)

        image_bytes = tile_provider.get_map_tile(
            viewpoint_item.local_object_path,
            tile_matrix_set_id,
            tile_matrix,
            tile_row,
            tile_col,
            tile_format,
            compression,
            viewpoint_item.range_adjustment,
        )

        headers = {"Cache-Control": f"private, max-age={ServerConfig.cache_control_max_age}"}
        if image_bytes is None:
            # OGC Tiles API Section 7.1.7.B indicates that a 204 should be returned for empty tiles
            return Response(status_code=status.HTTP_204_NO_CONTENT, headers=headers)

        return Response(
            bytes(image_bytes), media_type=get_media_type(tile_format), status_code=status.HTTP_200_OK, headers=headers
        )
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Failed to fetch tile. Invalid request. {err}")
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to fetch tile for image. {err}"
        )
