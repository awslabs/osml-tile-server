#  Copyright 2025-2026 Amazon.com, Inc. or its affiliates.

import unittest
from unittest.mock import MagicMock, patch

from aws.osml.gdal import GDALCompressionOptions, GDALImageFormats, RangeAdjustmentType
from aws.osml.tile_server.services.tile_provider import TileProvider


class TestTileProvider(unittest.TestCase):
    def setUp(self):
        """Set up test fixtures before each test method."""
        self.tile_provider = TileProvider()
        self.test_image_path = "test/data/test-sample.nitf"
        self.mock_image_bytes = bytearray(b"mock_image_data")

    @patch("aws.osml.tile_server.services.tile_provider.get_tile_factory_pool")
    def test_get_image_tile_success(self, mock_get_pool):
        """Test successful image tile retrieval"""
        # Setup mock tile factory
        mock_tile_factory = MagicMock()
        mock_tile_factory.create_encoded_tile.return_value = self.mock_image_bytes

        # Setup mock pool context manager
        mock_pool = MagicMock()
        mock_pool.checkout_in_context.return_value.__enter__.return_value = mock_tile_factory
        mock_get_pool.return_value = mock_pool

        result = self.tile_provider.get_image_tile(
            local_object_path=self.test_image_path,
            tile_size=512,
            z=0,
            y=0,
            x=0,
            tile_format=GDALImageFormats.NITF,
            compression=GDALCompressionOptions.J2K,
            range_adjustment=RangeAdjustmentType.DRA,
        )

        self.assertEqual(result, self.mock_image_bytes)
        mock_tile_factory.create_encoded_tile.assert_called_once()

    @patch("aws.osml.tile_server.services.tile_provider.get_tile_factory_pool")
    def test_get_image_tile_factory_none(self, mock_get_pool):
        """Test image tile retrieval when factory is None"""
        # Setup mock pool to return None
        mock_pool = MagicMock()
        mock_pool.checkout_in_context.return_value.__enter__.return_value = None
        mock_get_pool.return_value = mock_pool

        with self.assertRaises(Exception) as context:
            self.tile_provider.get_image_tile(
                local_object_path=self.test_image_path,
                tile_size=512,
                z=0,
                y=0,
                x=0,
                tile_format=GDALImageFormats.NITF,
                compression=GDALCompressionOptions.J2K,
                range_adjustment=RangeAdjustmentType.NONE,
            )

        self.assertTrue("Unable to read tiles from viewpoint" in str(context.exception))

    @patch("aws.osml.tile_server.services.tile_provider.get_tile_factory_pool")
    @patch("aws.osml.tile_server.services.tile_provider.MapTileSetFactory")
    def test_get_map_tile_success(self, mock_tile_set_factory, mock_get_pool):
        """Test successful map tile retrieval"""
        # Setup mock tile factory
        mock_tile_factory = MagicMock()
        mock_tile_factory.create_orthophoto_tile.return_value = self.mock_image_bytes

        # Setup mock pool context manager
        mock_pool = MagicMock()
        mock_pool.checkout_in_context.return_value.__enter__.return_value = mock_tile_factory
        mock_get_pool.return_value = mock_pool

        # Setup mock tile set
        mock_tile_set = MagicMock()
        mock_tile = MagicMock()
        mock_tile.bounds = [0, 0, 100, 100]
        mock_tile.size = 512
        mock_tile_set.get_tile.return_value = mock_tile
        mock_tile_set_factory.get_for_id.return_value = mock_tile_set

        result = self.tile_provider.get_map_tile(
            local_object_path=self.test_image_path,
            tile_matrix_set_id="WebMercatorQuad",
            tile_matrix=0,
            tile_row=0,
            tile_col=0,
            tile_format=GDALImageFormats.PNG,
            compression=GDALCompressionOptions.NONE,
            range_adjustment=RangeAdjustmentType.DRA,
        )

        self.assertEqual(result, self.mock_image_bytes)
        mock_tile_factory.create_orthophoto_tile.assert_called_once()

    @patch("aws.osml.tile_server.services.tile_provider.get_tile_factory_pool")
    def test_get_map_tile_factory_none(self, mock_get_pool):
        """Test map tile retrieval when factory is None"""
        # Setup mock pool to return None
        mock_pool = MagicMock()
        mock_pool.checkout_in_context.return_value.__enter__.return_value = None
        mock_get_pool.return_value = mock_pool

        with self.assertRaises(Exception) as context:
            self.tile_provider.get_map_tile(
                local_object_path=self.test_image_path,
                tile_matrix_set_id="WebMercatorQuad",
                tile_matrix=0,
                tile_row=0,
                tile_col=0,
                tile_format=GDALImageFormats.PNG,
                compression=GDALCompressionOptions.NONE,
                range_adjustment=RangeAdjustmentType.DRA,
            )

        self.assertTrue("Unable to read tiles from viewpoint" in str(context.exception))

    @patch("aws.osml.tile_server.services.tile_provider.MapTileSetFactory")
    def test_get_map_tile_invalid_tile_set(self, mock_tile_set_factory):
        """Test map tile retrieval with invalid tile set ID"""
        # Setup mock tile set factory to return None
        mock_tile_set_factory.get_for_id.return_value = None

        with self.assertRaises(ValueError) as context:
            self.tile_provider.get_map_tile(
                local_object_path=self.test_image_path,
                tile_matrix_set_id="InvalidTileSet",
                tile_matrix=0,
                tile_row=0,
                tile_col=0,
                tile_format=GDALImageFormats.PNG,
                compression=GDALCompressionOptions.NONE,
                range_adjustment=RangeAdjustmentType.DRA,
            )

        print(f"EXCEPTION: {context.exception}")
        self.assertTrue("Unsupported tile set" in str(context.exception))


if __name__ == "__main__":
    unittest.main()
