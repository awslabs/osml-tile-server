/*
 * Copyright 2025 Amazon.com, Inc. or its affiliates.
 */

import { Duration, RemovalPolicy, SymlinkFollowMode } from "aws-cdk-lib";
import { ISecurityGroup, IVpc, SubnetType } from "aws-cdk-lib/aws-ec2";
import { Platform } from "aws-cdk-lib/aws-ecr-assets";
import { IRole } from "aws-cdk-lib/aws-iam";
import { DockerImageCode, DockerImageFunction } from "aws-cdk-lib/aws-lambda";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import { writeFileSync } from "fs";
import { join } from "path";

import { BaseConfig, ConfigType, OSMLAccount } from "../types";

export class TestConfig extends BaseConfig {
  /**
   * Whether to build container resources from source.
   * @default "false"
   */
  public BUILD_FROM_SOURCE: boolean;

  /**
   * The build path for the test container.
   * @default "osml-tile-server"
   */
  public TEST_CONTAINER_BUILD_PATH: string;

  /**
   * The build target for the test container.
   * @default "../"
   */
  public TEST_CONTAINER_BUILD_TARGET: string;

  /**
   * The path to Dockerfile.ts to use to build the container.
   * @default "docker/Dockerfile.integ"
   */
  public TEST_CONTAINER_DOCKERFILE: string;

  /**
   * The Docker image to use for the test container.
   * @default "awsosml/osml-tile-server-test:latest"
   */
  public TEST_CONTAINER_URI: string;

  constructor(config: Partial<ConfigType> = {}) {
    const mergedConfig = {
      BUILD_FROM_SOURCE: false,
      TEST_CONTAINER_BUILD_PATH: "../",
      TEST_CONTAINER_BUILD_TARGET: "integ",
      TEST_CONTAINER_DOCKERFILE: "docker/Dockerfile.integ",
      TEST_CONTAINER_URI: "awsosml/osml-tile-server-test:latest",
      ...config,
    };
    super(mergedConfig);
  }
}

export interface TestProps {
  /** The OSML account configuration. */
  readonly account: OSMLAccount;
  /** The VPC configuration. */
  readonly vpc: IVpc;

  readonly lambdaRole: IRole;
  readonly securityGroup?: ISecurityGroup;
  /** The tile server service endpoint DNS name (from Dataplane stack export). */
  readonly serviceEndpointDnsName: string;
  /** The test configuration. */
  readonly config?: TestConfig;
}

export class Test extends Construct {
  /**
   * The docker image containing the integration tests.
   */
  public testImageCode: DockerImageCode;

  /**
   * The Lambda function that executes the integration tests.
   */
  public testingRunner: DockerImageFunction;

  /**
   * Configuration options for TestImagery.
   */
  public config: TestConfig;

  constructor(scope: Construct, id: string, props: TestProps) {
    super(scope, id);

    // Check if a custom configuration was provided
    if (props.config instanceof TestConfig) {
      this.config = props.config;
    } else {
      // Create a new default configuration
      this.config = new TestConfig(
        (props.config as unknown as Partial<ConfigType>) ?? {},
      );
    }

    this.testImageCode = this.createTestingImage();
    this.testingRunner = this.createTestingRunner(props);
  }

  private createTestingImage(): DockerImageCode {
    if (this.config.BUILD_FROM_SOURCE) {
      // Build from source using Docker
      // Specify platform to ensure compatibility with AWS Lambda (requires linux/amd64)
      // This is especially important when building on Mac (especially Apple Silicon)
      return DockerImageCode.fromImageAsset(
        this.config.TEST_CONTAINER_BUILD_PATH,
        {
          file: this.config.TEST_CONTAINER_DOCKERFILE,
          followSymlinks: SymlinkFollowMode.ALWAYS,
          target: this.config.TEST_CONTAINER_BUILD_TARGET,
          platform: Platform.LINUX_AMD64,
        },
      );
    } else {
      // Use pre-built image from registry
      const tmpDockerfile = join(__dirname, "Dockerfile.tmp");
      writeFileSync(tmpDockerfile, `FROM ${this.config.TEST_CONTAINER_URI}`);
      return DockerImageCode.fromImageAsset(__dirname, {
        file: "Dockerfile.tmp",
        followSymlinks: SymlinkFollowMode.ALWAYS,
        platform: Platform.LINUX_AMD64,
      });
    }
  }

  private createTestingRunner(props: TestProps): DockerImageFunction {
    const logGroup = new LogGroup(this, "TSTestRunnerLogGroup", {
      logGroupName: "/aws/lambda/TSTestRunner",
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY, // Integ test logs are always safe to remove on destroy
    });

    const runner = new DockerImageFunction(this, "TSTestRunner", {
      code: this.testImageCode,
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE_WITH_EGRESS,
      },
      role: props.lambdaRole,
      timeout: Duration.minutes(10),
      memorySize: 1024,
      functionName: "TSTestRunner",
      securityGroups: props.securityGroup ? [props.securityGroup] : [],
      logGroup: logGroup,
      environment: {
        TS_ENDPOINT: `http://${props.serviceEndpointDnsName}/latest`,
      },
    });
    return runner;
  }
}
