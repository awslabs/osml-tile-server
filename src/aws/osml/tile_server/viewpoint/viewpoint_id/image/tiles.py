#  Copyright 2024-2026 Amazon.com, Inc. or its affiliates.

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response, status

from aws.osml.gdal import GDALCompressionOptions, GDALImageFormats
from aws.osml.tile_server.app_config import ServerConfig
from aws.osml.tile_server.models import ViewpointApiNames, validate_viewpoint_status
from aws.osml.tile_server.services import AwsServices, TileProvider, get_aws_services, get_tile_provider
from aws.osml.tile_server.utils import get_media_type

tiles_router = APIRouter(
    prefix="/tiles",
    dependencies=[],
    responses={status.HTTP_404_NOT_FOUND: {"description": "Not found!"}},
)


@tiles_router.get("/{z}/{x}/{y}.{tile_format}")
def get_image_tile(
    viewpoint_id: str,
    z: int,
    x: int,
    y: int,
    aws: Annotated[AwsServices, Depends(get_aws_services)],
    tile_provider: Annotated[TileProvider, Depends(get_tile_provider)],
    tile_format: GDALImageFormats = Path(description="Output image type."),
    compression: GDALCompressionOptions = Query(GDALCompressionOptions.NONE, description="Compression Algorithm for image."),
) -> Response:
    """
    Create a tile of this image using the options set when creating the viewpoint.

    :param aws: Injected AWS services.
    :param tile_provider: Injected tile provider.
    :param viewpoint_id: Unique viewpoint id to get from the table.
    :param z: Resolution-level in the image pyramid 0 = full resolution, 1 = full/2, 2 = full/4, ...
    :param x: Tile row location in pixels for the given tile.
    :param y: Tile column location in pixels for the given tile.
    :param tile_format: Desired format for tile output, valid options are defined by GDALImageFormats.
    :param compression: GDAL tile compression format.
    :return: Response of tile image binary payload.
    """
    if z < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Resolution Level for get tile request must be >= 0. Requested z={z}",
        )
    try:
        viewpoint_item = aws.viewpoint_database.get_viewpoint(viewpoint_id)
        validate_viewpoint_status(viewpoint_item.viewpoint_status, ViewpointApiNames.TILE)

        image_bytes = tile_provider.get_image_tile(
            viewpoint_item.local_object_path,
            viewpoint_item.tile_size,
            z,
            y,
            x,
            tile_format,
            compression,
            viewpoint_item.range_adjustment,
        )
        headers = {"Cache-Control": f"private, max-age={ServerConfig.cache_control_max_age}"}
        return Response(
            content=bytes(image_bytes),
            media_type=get_media_type(tile_format),
            status_code=status.HTTP_200_OK,
            headers=headers,
        )
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Failed to fetch tile. Invalid request. {err}")
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to fetch tile for image. {err}"
        )
