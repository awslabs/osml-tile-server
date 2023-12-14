# OversightML Tile Server

The OversightML Tile Server is a lightweight, cloud-based tile server which allows you to quickly pass an image from S3 bucket to get metadata, image statistics, and set of tiles in real-time.

### Table of Contents
* [Getting Started](#getting-started)
  * [Package Layout](#package-layout)
  * [Prerequisites](prerequisites)
  * [Running Tile Server](#running-tile-server)
  * [Development Environment](#development-environment)
* [Support & Feedback](#support--feedback)
* [Security](#security)
* [License](#license)

## Getting Started

### Package Layout

* **/src**: This is the Python implementation of this application.
* **/test**: Unit tests have been implemented using [pytest](https://docs.pytest.org).
* **/scripts**: Utility scripts that are not part of the main application frequently used in development / testing.
* **/docs**: Contains Sphinx Doc configuration which is used to generate documentation for this package

### Prerequisites

First, ensure you have installed the following tools locally

- [docker](https://www.docker.com/)
- [docker compose](https://docs.docker.com/compose/)
- [tox](https://tox.wiki/en/latest/installation.html)

### Running Tile Server Locally

The Tile Server is designed to be able to be run locally using docker compose for development and testing purposes. Start the Tile Server using
```shell
docker compose up -d
```

To view the live log output while the server is running
```shell
docker logs -f osml-tile-server
```

To stop the tile server
```shell
docker compose down
```

To rebuild the docker image after making a code change, use
```shell
docker compose up -d --build
```

In another terminal to invoke the rest server and return the viewpoint on a single image, run the following command:

```bash
curl -X 'POST' \
  'http://localhost:8080/latest/viewpoints/' \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '{
  "bucket_name": "<S3 Bucket>",
  "object_key": "<Image Name>",
  "viewpoint_name": "test",
  "tile_size": 512,
  "range_adjustment": "NONE"
}'
```

Additionally, you can head over to FastAPI homepage and be able to execute various of API calls by visiting

```
http://0.0.0.0:8080/latest/docs or http://0.0.0.0:8080/latest/redoc
```

## Support & Feedback

To post feedback, submit feature ideas, or report bugs, please use the [Issues](https://github.com/aws-solutions-library-samples/osml-tile-server/issues) section of this GitHub repo.

If you are interested in contributing to OversightML Model Runner, see the [CONTRIBUTING](CONTRIBUTING.md) guide.

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the MIT-0 License. See the [LICENSE](LICENSE) file.
