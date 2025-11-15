/*
 * Copyright 2023-2025 Amazon.com, Inc. or its affiliates.
 */

import { RemovalPolicy } from "aws-cdk-lib";
import { ISecurityGroup, IVpc, SecurityGroup } from "aws-cdk-lib/aws-ec2";
import { IRole, Role } from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

import { BaseConfig, ConfigType, OSMLAccount, RegionalConfig } from "../types";
import { DatabaseTables } from "./database";
import { ECSService } from "./ecs-service";
import { Messaging } from "./messaging";
import { Storage } from "./storage";

/**
 * Configuration class for Dataplane Construct.
 */
export class DataplaneConfig extends BaseConfig {
  /**
   * The FastAPI root path for viewpoints.
   */
  public readonly FASTAPI_ROOT_PATH?: string | undefined;

  /**
   * Whether to build container resources from source.
   * @default "false"
   */
  public readonly BUILD_FROM_SOURCE: boolean;

  /**
   * The build path for the TileServer.
   * @default "../"
   */
  public readonly CONTAINER_BUILD_PATH: string;

  /**
   * The build target for the TileServer.
   * @default "tile_server"
   */
  public readonly CONTAINER_BUILD_TARGET: string;

  /**
   * The path to Dockerfile.tile_server to use to build the container.
   * @default "docker/Dockerfile.tile_server"
   */
  public readonly CONTAINER_DOCKERFILE: string;

  /**
   * The container image to use for the TileServer.
   * @default "awsosml/osml-tile-server:latest"
   */
  public readonly CONTAINER_URI: string;

  /**
   * The name of the TS Log Group.
   * @default "TSService"
   */
  public readonly CW_LOGGROUP_NAME: string;

  /**
   *  The namespace for metrics.
   *  @default "OSML"
   *  */
  public readonly CW_METRICS_NAMESPACE: string;

  /**
   * The name of the DynamoDB table for job status.
   * @default "TSJobTable"
   */
  public readonly DDB_JOB_TABLE: string;

  /**
   * The attribute name for expiration time in DynamoDB.
   * @default "expire_time"
   */
  public readonly DDB_TTL_ATTRIBUTE: string;

  /**
   * The name of the EFS volume to give tasks.
   * @default "ts-efs-volume"
   */
  public readonly EFS_MOUNT_NAME: string;

  /**
   * The CPU configuration for TS containers.
   * @default 8192
   */
  public readonly ECS_CONTAINER_CPU: number;

  /**
   * The memory configuration for TS containers.
   * @default 16384
   */
  public readonly ECS_CONTAINER_MEMORY: number;

  /**
   * The name of the TS container.
   * @default "TSContainer"
   */
  public readonly ECS_CONTAINER_NAME: string;

  /**
   * The port to use for the TS service.
   * @default 8080
   */
  public readonly ECS_CONTAINER_PORT: number;

  /**
   * The name of the TS cluster.
   * @default "TSCluster"
   */
  public readonly ECS_CLUSTER_NAME: string;

  /**
   * The name of the TS ECS execution role.
   * @default undefined
   */
  public readonly ECS_EXECUTION_ROLE_NAME?: string | undefined;

  /**
   * The security group ID to use for the Tile Server components.
   * @default undefined
   */
  public readonly SECURITY_GROUP_ID?: string | undefined;

  /**
   * The CPU configuration for TS tasks.
   * @default 8192
   */
  public readonly ECS_TASK_CPU: number;

  /**
   * The memory configuration for TS tasks.
   * @default 16384
   */
  public readonly ECS_TASK_MEMORY: number;

  /**
   * The name of the TS task execution role.
   * @default undefined
   */
  public readonly ECS_TASK_ROLE_NAME?: string | undefined;

  /**
   * The name of the SQS queues for image status.
   * @default "TSJobQueue"
   */
  public readonly SQS_JOB_QUEUE: string;

  /**
   * Constructor for DataplaneConfig.
   * @param config - The configuration object for the Dataplane.
   */
  constructor(config: Partial<ConfigType> = {}) {
    const mergedConfig = {
      BUILD_FROM_SOURCE: false,
      CONTAINER_BUILD_PATH: "../",
      CONTAINER_BUILD_TARGET: "tile_server",
      CONTAINER_DOCKERFILE: "docker/Dockerfile.tile_server",
      CONTAINER_URI: "awsosml/osml-tile-server:latest",
      CW_LOGGROUP_NAME: "TSService",
      CW_METRICS_NAMESPACE: "OSML",
      DDB_JOB_TABLE: "TSJobTable",
      DDB_TTL_ATTRIBUTE: "expire_time",
      EFS_MOUNT_NAME: "ts-efs-volume",
      ECS_CONTAINER_CPU: 8192,
      ECS_CONTAINER_MEMORY: 16384,
      ECS_CONTAINER_NAME: "TSContainer",
      ECS_CONTAINER_PORT: 8080,
      ECS_CLUSTER_NAME: "TSCluster",
      ECS_TASK_CPU: 8192,
      ECS_TASK_MEMORY: 16384,
      SQS_JOB_QUEUE: "TSJobQueue",
      ...config,
    };
    super(mergedConfig);

    this.validateConfig(mergedConfig);
  }

  /**
   * Validates the configuration values.
   *
   * @param config - The configuration to validate
   * @throws Error if validation fails
   */
  private validateConfig(config: Record<string, unknown>): void {
    const errors: string[] = [];

    // Validate ECS constraints (AWS Fargate limits)
    const ecsTaskCpu =
      typeof config.ECS_TASK_CPU === "number" ? config.ECS_TASK_CPU : 0;
    if (ecsTaskCpu < 256) {
      errors.push("ECS_TASK_CPU must be at least 256 (0.25 vCPU)");
    }
    if (ecsTaskCpu > 16384) {
      errors.push("ECS_TASK_CPU must be at most 16384 (16 vCPU)");
    }

    const ecsTaskMemory =
      typeof config.ECS_TASK_MEMORY === "number" ? config.ECS_TASK_MEMORY : 0;
    if (ecsTaskMemory < 512) {
      errors.push("ECS_TASK_MEMORY must be at least 512 MiB");
    }
    if (ecsTaskMemory > 122880) {
      errors.push("ECS_TASK_MEMORY must be at most 122880 MiB (120 GB)");
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join("\n")}`);
    }
  }
}

/**
 * Interface representing properties for configuring the Dataplane Construct.
 */
export interface DataplaneProps {
  /**
   * The OSML deployment account.
   * @type {OSMLAccount}
   */
  readonly account: OSMLAccount;

  /**
   * The VPC (Virtual Private Cloud) for the Dataplane.
   * @type {Vpc}
   */
  readonly vpc: IVpc;

  /**
   * The optional security group for the Dataplane.
   * @type {SecurityGroup}
   */
  readonly securityGroup?: ISecurityGroup;

  /**
   * Custom configuration for the Dataplane Construct (optional).
   * @type {DataplaneConfig | undefined}
   */
  config?: DataplaneConfig;
}

/**
 * Represents the TSDataplane construct responsible for managing the data plane
 * of the tile server application. It handles various AWS resources and configurations
 * required for the application's operation.
 *
 * @param {Construct} scope - The scope/stack in which to define this construct.
 * @param {string} id - The id of this construct within the current scope.
 * @param {DataplaneProps} props - The properties of this construct.
 * @returns {Dataplane} - The TileServerDataplane construct.
 */
export class Dataplane extends Construct {
  /**
   * The IAM role for the Lambda function.
   */
  public lambdaRole: IRole;

  /**
   * The configuration for the TSDataplane.
   */
  public config: DataplaneConfig;

  /**
   * The removal policy for resources created by this construct.
   */
  public removalPolicy: RemovalPolicy;

  /**
   * The regional S3 endpoint.
   */
  public regionalS3Endpoint: string;

  /**
   * Database tables for this construct.
   */
  public readonly databaseTables: DatabaseTables;

  /**
   * Messaging resources for this construct.
   */
  public readonly messaging: Messaging;

  /**
   * Messaging resources for this construct.
   */
  public readonly storage: Storage;

  /** The ECS service resources. */
  public readonly ecsService: ECSService;

  /**
   * The security group for the Dataplane.
   */
  public securityGroups?: ISecurityGroup[];

  /**
   * Constructs an instance of Dataplane.
   *
   * @constructor
   * @param {Construct} scope - The scope/stack in which to define this construct.
   * @param {string} id - The id of this construct within the current scope.
   * @param {DataplaneProps} props - The properties of this construct.
   */
  constructor(scope: Construct, id: string, props: DataplaneProps) {
    super(scope, id);

    // Setup class from base properties
    this.config = this.initializeConfig(props);
    this.removalPolicy = this.initializeRemovalPolicy(props);
    this.regionalS3Endpoint = this.initializeRegionalS3Endpoint(props);
    this.securityGroups = this.initializeSecurityGroups(props);

    this.databaseTables = this.createDatabaseTables(props);
    this.messaging = this.createMessaging(props);
    this.storage = this.createStorage(props);
    this.ecsService = this.createEcsService(props);

    // Allow access to EFS from Fargate ECS
    this.storage.fileSystem.grantRootAccess(
      this.ecsService.fargateService.taskDefinition.taskRole,
    );

    // Allow connections to the file system from the ECS cluster
    this.storage.fileSystem.connections.allowDefaultPortFrom(
      this.ecsService.fargateService.service.connections,
    );
  }

  /**
   * Creates database tables.
   *
   * @param props - The Dataplane properties
   * @returns The database tables
   */
  private createDatabaseTables(props: DataplaneProps): DatabaseTables {
    return new DatabaseTables(this, "DatabaseTables", {
      account: props.account,
      config: this.config,
      removalPolicy: this.removalPolicy,
    });
  }

  /**
   * Creates messaging resources.
   *
   * @param props - The Dataplane properties
   * @returns The messaging resources
   */
  private createMessaging(props: DataplaneProps): Messaging {
    return new Messaging(this, "Messaging", {
      account: props.account,
      config: this.config,
    });
  }

  /**
   * Creates storage resources.
   *
   * @param props - The Dataplane properties
   * @returns The storage resources
   */
  private createStorage(props: DataplaneProps): Storage {
    return new Storage(this, "Storage", {
      account: props.account,
      vpc: props.vpc,
      config: this.config,
      removalPolicy: this.removalPolicy,
      securityGroup: this.securityGroups ? this.securityGroups[0] : undefined,
    });
  }

  /**
   * Creates ECS service resources.
   *
   * @param props - The Dataplane properties
   * @returns The ECS service resources
   */
  private createEcsService(props: DataplaneProps): ECSService {
    // Get existing roles if specified in config
    const existingTaskRole = this.config.ECS_TASK_ROLE_NAME
      ? Role.fromRoleName(
          this,
          "ImportedEcsTaskRole",
          this.config.ECS_TASK_ROLE_NAME,
          { mutable: false },
        )
      : undefined;

    const existingExecutionRole = this.config.ECS_EXECUTION_ROLE_NAME
      ? Role.fromRoleName(
          this,
          "ImportedECSExecutionRole",
          this.config.ECS_EXECUTION_ROLE_NAME,
          { mutable: false },
        )
      : undefined;
    return new ECSService(this, "ECSService", {
      account: props.account,
      vpc: props.vpc,
      config: this.config,
      taskRole: existingTaskRole,
      executionRole: existingExecutionRole,
      removalPolicy: this.removalPolicy,
      regionalS3Endpoint: this.regionalS3Endpoint,
      securityGroups: this.securityGroups,
      jobTable: this.databaseTables.jobTable,
      jobQueue: this.messaging.jobQueue,
      fileSystem: this.storage.fileSystem,
      accessPoint: this.storage.accessPoint,
    });
  }

  /**
   * Initializes the configuration.
   *
   * @param props - The Dataplane properties
   * @returns The initialized configuration
   */
  private initializeConfig(props: DataplaneProps): DataplaneConfig {
    if (props.config instanceof DataplaneConfig) {
      return props.config;
    }
    return new DataplaneConfig(
      (props.config as unknown as Partial<ConfigType>) ?? {},
    );
  }

  /**
   * Initializes the removal policy based on account type.
   *
   * @param props - The Dataplane properties
   * @returns The removal policy
   */
  private initializeRemovalPolicy(props: DataplaneProps): RemovalPolicy {
    return props.account.prodLike
      ? RemovalPolicy.RETAIN
      : RemovalPolicy.DESTROY;
  }

  /**
   * Initializes the regional S3 endpoint.
   *
   * @param props - The Dataplane properties
   * @returns The regional S3 endpoint
   */
  private initializeRegionalS3Endpoint(props: DataplaneProps): string {
    return RegionalConfig.getConfig(props.account.region).s3Endpoint;
  }

  /**
   * Initializes security groups if specified.
   *
   * @param props - The Dataplane properties
   * @returns The security groups or undefined
   */
  private initializeSecurityGroups(
    props: DataplaneProps,
  ): ISecurityGroup[] | undefined {
    if (this.config.SECURITY_GROUP_ID) {
      return [
        SecurityGroup.fromSecurityGroupId(
          this,
          "TSImportSecurityGroup",
          this.config.SECURITY_GROUP_ID,
        ),
      ];
    }
    if (props.securityGroup) {
      return [props.securityGroup];
    }
    return undefined;
  }
}
