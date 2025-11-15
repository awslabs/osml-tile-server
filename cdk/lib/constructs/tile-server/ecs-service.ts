/*
 * Copyright 2023-2025 Amazon.com, Inc. or its affiliates.
 */

import { Duration, RemovalPolicy } from "aws-cdk-lib";
import { ITable } from "aws-cdk-lib/aws-dynamodb";
import { ISecurityGroup, IVpc, SubnetType } from "aws-cdk-lib/aws-ec2";
import { Platform } from "aws-cdk-lib/aws-ecr-assets";
import {
  AwsLogDriver,
  Cluster,
  ContainerDefinition,
  ContainerImage,
  ContainerInsights,
  FargateTaskDefinition,
  Protocol,
} from "aws-cdk-lib/aws-ecs";
import { ApplicationLoadBalancedFargateService } from "aws-cdk-lib/aws-ecs-patterns";
import { IAccessPoint, IFileSystem } from "aws-cdk-lib/aws-efs";
import { ApplicationLoadBalancer } from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Protocol as elbv2_protocol } from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { IRole } from "aws-cdk-lib/aws-iam";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { IQueue } from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";

import { OSMLAccount } from "../types";
import { DataplaneConfig } from "./dataplane";
import { ECSRoles } from "./ecs-roles";

/**
 * Properties for creating ECS service resources.
 */
export interface ECSServiceProps {
  /** The OSML account configuration. */
  readonly account: OSMLAccount;
  /** The VPC configuration. */
  readonly vpc: IVpc;
  /** The MR dataplane configuration. */
  readonly config: DataplaneConfig;
  /** Optional ECS task role. If not provided, will be created. */
  readonly taskRole?: IRole;
  /** Optional ECS execution role. If not provided, will be created. */
  readonly executionRole?: IRole;
  /** The removal policy for resources. */
  readonly removalPolicy: RemovalPolicy;
  /** The regional S3 endpoint. */
  readonly regionalS3Endpoint: string;
  /** The security groups for the Fargate service. */
  readonly securityGroups?: ISecurityGroup[];
  /** The DynamoDB table for jobs. */
  readonly jobTable: ITable;
  /** The SQS queue for processing jobs. */
  readonly jobQueue: IQueue;
  /** The EFS file system */
  readonly fileSystem: IFileSystem;
  /** The EFS Access Point */
  readonly accessPoint: IAccessPoint;
}

/**
 * Construct that manages all ECS service resources.
 *
 * This construct encapsulates the creation and configuration of all ECS
 * resources, including the ECS cluster, task
 * definition, Fargate service, and container image.
 */
export class ECSService extends Construct {
  /** The ECS cluster for running tasks. */
  public readonly cluster: Cluster;

  /** The Fargate task definition. */
  public readonly taskDefinition: FargateTaskDefinition;

  /** The Fargate service for the container. */
  public readonly fargateService: ApplicationLoadBalancedFargateService;

  /** The ALB for Fargate */
  public readonly alb: ApplicationLoadBalancer;

  /** The container definition for the service. */
  public readonly containerDefinition: ContainerDefinition;

  /** The container image for the service. */
  public readonly containerImage: ContainerImage;

  /** The log group for the service. */
  public readonly logGroup: LogGroup;

  /** The ECS roles (task and execution roles). */
  public readonly ecsRoles: ECSRoles;

  /**
   * Creates a new ECSService construct.
   *
   * @param scope - The scope/stack in which to define this construct
   * @param id - The id of this construct within the current scope
   * @param props - The properties for configuring this construct
   */
  constructor(scope: Construct, id: string, props: ECSServiceProps) {
    super(scope, id);

    // Create ECS roles
    this.ecsRoles = this.createECSRoles(props);

    // Create log group
    this.logGroup = this.createLogGroup(props);

    // Create container image
    this.containerImage = this.createContainerImage(props);

    // Create ECS cluster
    this.cluster = this.createCluster(props);

    // Create task definition
    this.taskDefinition = this.createTaskDefinition(props);

    // Create container definition
    this.containerDefinition = this.createContainerDefinition(props);

    // Create Fargate ALB
    this.alb = this.createAlb(props);

    // Create Fargate service
    this.fargateService = this.createFargateService(props);
  }

  /**
   * Creates the ECS roles.
   *
   * @param props - The ECS service properties
   * @returns The created ECSRoles
   */
  private createECSRoles(props: ECSServiceProps): ECSRoles {
    return new ECSRoles(this, "TileServerECSRoles", {
      account: props.account,
      taskRoleName: "TileServerECSTaskRole",
      executionRoleName: "TileServerECSExecutionRole",
      existingTaskRole: props.taskRole,
      existingExecutionRole: props.executionRole,
    });
  }

  /**
   * Creates the CloudWatch log group.
   *
   * @param props - The ECS service properties
   * @returns The created LogGroup
   */
  private createLogGroup(props: ECSServiceProps): LogGroup {
    return new LogGroup(this, "TSServiceLogGroup", {
      logGroupName: `/aws/OSML/${props.config.CW_LOGGROUP_NAME}`,
      retention: RetentionDays.TEN_YEARS,
      removalPolicy: props.removalPolicy,
    });
  }

  /**
   * Creates the container image.
   *
   * @param props - The ECS service properties
   * @returns The created ContainerImage
   */
  private createContainerImage(props: ECSServiceProps): ContainerImage {
    if (props.config.BUILD_FROM_SOURCE) {
      // Build from source using Docker
      return ContainerImage.fromAsset(props.config.CONTAINER_BUILD_PATH, {
        target: props.config.CONTAINER_BUILD_TARGET,
        file: props.config.CONTAINER_DOCKERFILE,
        platform: Platform.LINUX_AMD64,
      });
    } else {
      // Use pre-built image from registry
      return ContainerImage.fromRegistry(props.config.CONTAINER_URI);
    }
  }

  /**
   * Creates the ECS cluster.
   *
   * @param props - The ECS service properties
   * @returns The created Cluster
   */
  private createCluster(props: ECSServiceProps): Cluster {
    return new Cluster(this, "TSCluster", {
      clusterName: props.config.ECS_CLUSTER_NAME,
      vpc: props.vpc,
      containerInsightsV2: props.account.prodLike
        ? ContainerInsights.ENABLED
        : ContainerInsights.ENHANCED,
    });
  }

  /**
   * Creates the ECS task definition.
   *
   * @param props - The ECS service properties
   * @returns The created TaskDefinition
   */
  private createTaskDefinition(props: ECSServiceProps): FargateTaskDefinition {
    return new FargateTaskDefinition(this, "TSTaskDefinition", {
      memoryLimitMiB: props.config.ECS_TASK_MEMORY,
      cpu: props.config.ECS_TASK_CPU,
      taskRole: this.ecsRoles.taskRole,
      executionRole: this.ecsRoles.executionRole,
      ephemeralStorageGiB: 21,
      volumes: [
        {
          name: props.config.EFS_MOUNT_NAME,
          efsVolumeConfiguration: {
            fileSystemId: props.fileSystem.fileSystemId,
            transitEncryption: "ENABLED",
            authorizationConfig: {
              iam: "ENABLED",
              accessPointId: props.accessPoint.accessPointId,
            },
          },
        },
      ],
    });
  }

  /**
   * Creates the container definition.
   *
   * @param props - The ECS service properties
   * @returns The created ContainerDefinition
   */
  private createContainerDefinition(
    props: ECSServiceProps,
  ): ContainerDefinition {
    const containerDefinition = this.taskDefinition.addContainer(
      "TSContainerDefinition",
      {
        containerName: props.config.ECS_CONTAINER_NAME,
        image: this.containerImage,
        memoryLimitMiB: props.config.ECS_CONTAINER_MEMORY,
        cpu: props.config.ECS_CONTAINER_CPU,
        environment: this.buildContainerEnvironment(props),
        startTimeout: Duration.minutes(1),
        stopTimeout: Duration.minutes(1),
        disableNetworking: false,
        logging: new AwsLogDriver({
          logGroup: this.logGroup,
          streamPrefix: props.config.CW_METRICS_NAMESPACE,
        }),
        healthCheck: {
          command: [
            `curl --fail http://localhost:${props.config.ECS_CONTAINER_PORT}/ping || exit 1`,
          ],
          interval: Duration.seconds(30),
          retries: 3,
          timeout: Duration.seconds(10),
        },
      },
    );

    // Add port mapping to container definition
    containerDefinition.addPortMappings({
      containerPort: props.config.ECS_CONTAINER_PORT,
      protocol: Protocol.TCP,
    });

    // Mount EFS to container
    containerDefinition.addMountPoints({
      sourceVolume: props.config.EFS_MOUNT_NAME,
      containerPath: `/${props.config.EFS_MOUNT_NAME}`,
      readOnly: false,
    });

    return containerDefinition;
  }

  /**
   * Create the ALB for Fargate
   *
   * @param props - The ALB properties
   * @returns The created ApplicationLoadBalancer
   */
  private createAlb(props: ECSServiceProps): ApplicationLoadBalancer {
    return new ApplicationLoadBalancer(
      this,
      "TSServiceApplicationLoadBalancer",
      {
        vpc: props.vpc,
        vpcSubnets: {
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
        },
        securityGroup: props.securityGroups
          ? props.securityGroups[0]
          : undefined,
        internetFacing: false,
      },
    );
  }

  /**
   * Creates the Fargate service.
   *
   * @param props - The ECS service properties
   * @returns The created FargateService
   */
  private createFargateService(
    props: ECSServiceProps,
  ): ApplicationLoadBalancedFargateService {
    const fargateService = new ApplicationLoadBalancedFargateService(
      this,
      "TSService",
      {
        taskDefinition: this.taskDefinition,
        cluster: this.cluster,
        minHealthyPercent: 100,
        securityGroups: props.securityGroups ? props.securityGroups : [],
        taskSubnets: {
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
        },
        assignPublicIp: false,
        loadBalancer: this.alb,
      },
    );

    fargateService.targetGroup.configureHealthCheck({
      path: "/ping",
      port: props.config.ECS_CONTAINER_PORT.toString(),
      protocol: elbv2_protocol.HTTP,
      healthyThresholdCount: 5,
      unhealthyThresholdCount: 2,
      timeout: Duration.seconds(5),
      interval: Duration.seconds(30),
    });

    return fargateService;
  }

  /**
   * Builds the container environment variables.
   *
   * @param props - The ECS service properties
   * @returns The environment variables object
   */
  private buildContainerEnvironment(props: ECSServiceProps): {
    [key: string]: string;
  } {
    return {
      AWS_DEFAULT_REGION: props.account.region,
      JOB_TABLE: props.jobTable.tableName,
      JOB_QUEUE: props.jobQueue.queueName,
      AWS_S3_ENDPOINT: props.regionalS3Endpoint,
      EFS_MOUNT_NAME: props.config.EFS_MOUNT_NAME,
      STS_ARN: this.ecsRoles.taskRole.roleArn,
      ...(props.config.FASTAPI_ROOT_PATH !== undefined && {
        FASTAPI_ROOT_PATH: props.config.FASTAPI_ROOT_PATH,
      }),
    };
  }
}
