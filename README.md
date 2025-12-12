# OversightML Tile Server

The OversightML Tile Server (TS) is a lightweight, cloud-based tile server which provides RESTful APIs for accessing
pixels and metadata for imagery stored in the cloud. Key features include:

* Works with imagery conforming to [Cloud Optimized GeoTIFF (COG)](https://www.cogeo.org/) and [National Imagery Transmission Format (NITF)](https://en.wikipedia.org/wiki/National_Imagery_Transmission_Format) standards
* Creates both orthophoto map and unwarped image tiles. Map tiles are produced by on-the-fly warping of a raw input image pyramid.
* Outputs images in PNG, TIFF, JPEG formats. Can also output NITFs for tiles without warping
* Conforms to [OGC API - Tiles](https://ogcapi.ogc.org/tiles/) specification

## Table of Contents

* [Getting Started](#getting-started)
  * [Package Layout](#package-layout)
  * [Prerequisites](prerequisites)
  * [Running Tile Server Locally](#running-tile-server-locally)
* [Support & Feedback](#support--feedback)
* [Security](#security)
* [License](#license)

## Getting Started

### Package Layout

* **/src**: This is the Python implementation of this application.
* **/test**: Unit and integration tests have been implemented using [pytest](https://docs.pytest.org).
* **/doc**: Contains Sphinx Doc configuration which is used to generate documentation for this package
* **/test-load**: Contains sample [Locust](https://locust.io) configuration files which is used to run load test against the Tile Server

### Prerequisites

First, ensure you have installed the following tools locally

* [docker](https://www.docker.com/)
* [docker compose](https://docs.docker.com/compose/)
* [tox](https://tox.wiki/en/latest/installation.html)

### Cloning the repository

Clone the repository to your local computer using

```git clone https://github.com/aws-solutions-library-samples/osml-tile-server.git```

Navigate to the cloned directory using ```cd``` or ```dir```, depending on your operating system.

More information about cloning and managing repositories can be found in the [GitHub Docs](https://docs.github.com/en/repositories/creating-and-managing-repositories/cloning-a-repository).

### Deploying the Infrastructure

The Tile Server now includes complete AWS CDK infrastructure code in the `/cdk` directory. This allows you to deploy the entire application stack to AWS with a single command.

For detailed deployment instructions, configuration options, and integration testing guidance, see the [CDK Deployment Guide](cdk/README.md).

Quick deployment overview:

1. Navigate to the `cdk` directory
2. Install dependencies: `npm install`
3. Configure deployment: Copy `bin/deployment/deployment.json.example` to `bin/deployment/deployment.json` and update with your AWS account details
4. Build: `npm run build`
5. Deploy: `cdk deploy --all --require-approval never`

The CDK deployment creates:

* **Network Stack**: VPC, subnets, security groups, and NAT gateways (or imports existing VPC)
* **Tile Server Stack**: ECS Fargate service, DynamoDB tables, S3 buckets, SQS queues, and IAM roles
* **Test Stack** (optional): Integration test infrastructure including Lambda function and test imagery

### Running Tile Server Locally

The Tile Server is designed to be able to be run locally using docker compose for development and testing purposes
using docker compose.

*Note*: Some operating systems may use ```docker-compose``` instead of ```docker compose```.

Configure your [AWS credentials](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-envvars.html)
for the account in which the Tile Server infrastructure was deployed by setting your environment variables.

```bash
export AWS_DEFAULT_REGION=<region where TS infrastructure deployed>
export AWS_ACCESS_KEY_ID=<AKIAIOSFODNN7EXAMPLE>
export AWS_SECRET_ACCESS_KEY=<wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY>
```

Start the Tile Server using

```shell
docker compose -f docker/docker-compose.yml up -d
```

To view the live log output while the server is running

```shell
docker logs -f osml-tile-server
```

To stop the tile server

```shell
docker compose -f docker/docker-compose.yml down
```

To rebuild the docker image after making a code change, use

```shell
docker compose -f docker/docker-compose.yml up -d --build
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

Additionally, you can view the API in the browser and execute various API calls by visiting

```text
http://0.0.0.0:8080/latest/docs or http://0.0.0.0:8080/latest/redoc
```

### Integration Testing

The Tile Server includes comprehensive integration testing infrastructure that validates the deployed service end-to-end. Integration tests verify that all components work together correctly, including:

* Image upload and processing
* Viewpoint creation and management
* Tile generation and retrieval
* API endpoint functionality

For detailed information on running integration tests against your deployed infrastructure, see the [Integration Testing section](cdk/README.md#integration-testing) in the CDK Deployment Guide.

Quick integration test overview:

1. Deploy the infrastructure with integration tests enabled (see [CDK Deployment Guide](cdk/README.md))
2. Run the integration test script: `bash scripts/tile_server_integ.sh`
3. Review test results and logs

## Support & Feedback

To post feedback, submit feature ideas, or report bugs, please use the [Issues](https://github.com/awslabs/osml-tile-server/issues) section of this GitHub repo.

If you are interested in contributing to OversightML Model Runner, see the [CONTRIBUTING](CONTRIBUTING.md) guide.

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the MIT-0 License. See the [LICENSE](LICENSE) file.
