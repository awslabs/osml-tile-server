#  Copyright 2024-2025 Amazon.com, Inc. or its affiliates.
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from starlette.responses import FileResponse

from aws.osml.tile_server.app_config import ServerConfig
from aws.osml.tile_server.models import (
    ViewpointApiNames,
    ViewpointNotFoundError,
    ViewpointNotReadyError,
    validate_viewpoint_status,
)
from aws.osml.tile_server.services import get_aws_services

statistics_router = APIRouter(
    prefix="/statistics",
    dependencies=[],
    responses={status.HTTP_404_NOT_FOUND: {"description": "Not found!"}},
)


@statistics_router.get("")
def get_image_statistics(viewpoint_id: str, aws: Annotated[get_aws_services, Depends()]) -> FileResponse:
    """
    Get viewpoint statistics based on provided viewpoint id.

    :param aws: Injected AWS services.
    :param viewpoint_id: Unique viewpoint id to get from the table.
    :return: FileResponse containing statistics associated with the viewpoint.
    """
    try:
        viewpoint_item = aws.viewpoint_database.get_viewpoint(viewpoint_id)
        validate_viewpoint_status(viewpoint_item.viewpoint_status, ViewpointApiNames.STATISTICS)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"viewpoint_id {viewpoint_id} not found.")
    except ViewpointNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ViewpointNotReadyError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to get statistics.")

    return FileResponse(
        viewpoint_item.local_object_path + ServerConfig.STATISTICS_FILE_EXTENSION, media_type="application/json"
    )
