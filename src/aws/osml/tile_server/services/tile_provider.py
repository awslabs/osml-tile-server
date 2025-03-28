#  Copyright 2024-2026 Amazon.com, Inc. or its affiliates.

import logging
from functools import lru_cache
from typing import Optional

from osgeo import gdalconst

from aws.osml.gdal import GDALCompressionOptions, GDALImageFormats, RangeAdjustmentType
from aws.osml.image_processing import MapTileId, MapTileSetFactory
from aws.osml.tile_server.app_config import ServerConfig
from aws.osml.tile_server.utils import get_tile_factory_pool

logger = logging.getLogger(__name__)


class TileProvider:
    """
    The tile provider is a service that creates imagery or map tiles as needed. It is responsible for caching
    duplicative requests to minimize unnecessary processing.
    """

    @lru_cache(maxsize=ServerConfig.tile_provider_cached_tile_count)
    def get_image_tile(
        self,
        local_object_path: str,
        tile_size: int,
        z: int,
        y: int,
        x: int,
        tile_format: GDALImageFormats,
        compression: GDALCompressionOptions,
        range_adjustment: RangeAdjustmentType,
    ) -> Optional[bytearray]:
        """
        Retrieves and unwarped image tile of the requested size encoded using the format/compression selected.
        If a range adjustment is specified the image will be preprocessed to an 8 bit per band result using
        the algorithm requested.

        Note that this method will attempt to respond to duplicative requests using previously computed results.

        :param local_object_path: path to the local image file
        :param tile_size: size of the tile in pixels
        :param z: resolution-level in the image pyramid 0 = full resolution, 1 = full/2, 2 = full/4, ...
        :param y: tile row in the image pyramid
        :param x: tile column in the image pyramid
        :param tile_format: image format for the output tile
        :param compression: compression to use with the output tile; must be compatible with format
        :param range_adjustment: type of pixel range adjustment to apply
        :return: the encoded image tile
        """
        output_type = None
        if range_adjustment is not RangeAdjustmentType.NONE:
            output_type = gdalconst.GDT_Byte

        tile_factory_pool = get_tile_factory_pool(tile_format, compression, local_object_path, output_type, range_adjustment)

        with tile_factory_pool.checkout_in_context() as tile_factory:
            if tile_factory is None:
                raise Exception(f"Unable to read tiles from viewpoint {local_object_path}")

            src_tile_size = 2**z * tile_size
            image_bytes = tile_factory.create_encoded_tile(
                src_window=[x * src_tile_size, y * src_tile_size, src_tile_size, src_tile_size],
                output_size=(tile_size, tile_size),
            )

        return image_bytes

    @lru_cache(maxsize=ServerConfig.tile_provider_cached_tile_count)
    def get_map_tile(
        self,
        local_object_path: str,
        tile_matrix_set_id: str,
        tile_matrix: int,
        tile_row: int,
        tile_col: int,
        tile_format: GDALImageFormats,
        compression: GDALCompressionOptions,
        range_adjustment: RangeAdjustmentType,
    ) -> Optional[bytearray]:
        output_type = None
        if range_adjustment is not RangeAdjustmentType.NONE:
            output_type = gdalconst.GDT_Byte

        tile_factory_pool = get_tile_factory_pool(tile_format, compression, local_object_path, output_type, range_adjustment)

        with tile_factory_pool.checkout_in_context() as tile_factory:
            if tile_factory is None:
                raise Exception(f"Unable to read tiles from viewpoint {local_object_path}")

            # Find the tile in the named tileset
            tile_set = MapTileSetFactory.get_for_id(tile_matrix_set_id)
            if not tile_set:
                raise ValueError(f"Unsupported tile set: {tile_matrix_set_id}")
            tile_id = MapTileId(tile_matrix=tile_matrix, tile_row=tile_row, tile_col=tile_col)
            tile = tile_set.get_tile(tile_id)

            # Create an orthophoto for this tile
            image_bytes = tile_factory.create_orthophoto_tile(geo_bbox=tile.bounds, tile_size=tile.size)

        return image_bytes


def get_tile_provider() -> TileProvider:
    return TileProvider()
