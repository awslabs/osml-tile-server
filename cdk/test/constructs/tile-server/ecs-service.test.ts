/*
 * Copyright 2024-2025 Amazon.com, Inc. or its affiliates.
 */

import { App, RemovalPolicy, Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { AttributeType, Table } from "aws-cdk-lib/aws-dynamodb";
import { SecurityGroup, Vpc } from "aws-cdk-lib/aws-ec2";
import { AccessPoint, FileSystem } from "aws-cdk-lib/aws-efs";
import { Queue } from "aws-cdk-lib/aws-sqs";

import { DataplaneConfig } from "../../../lib/constructs/tile-server/dataplane";
import { ECSService } from "../../../lib/constructs/tile-server/ecs-service";
import { testAccount, testProdAccount } from "../../test-account";

describe("ECSService", () => {
  let app: App;
  let stack: Stack;
  let vpc: Vpc;
  let config: DataplaneConfig;
  let jobTable: Table;
  let jobQueue: Queue;
  let fileSystem: FileSystem;
  let accessPoint: AccessPoint;

  beforeEach(() => {
    app = new App();
    stack = new Stack(app, "TestStack", {
      env: { account: testAccount.id, region: testAccount.region },
    });
    vpc = new Vpc(stack, "TestVpc");
    config = new DataplaneConfig();

    // Create required resources
    jobTable = new Table(stack, "TestJobTable", {
      partitionKey: { name: "id", type: AttributeType.STRING },
    });

    jobQueue = new Queue(stack, "TestJobQueue");

    fileSystem = new FileSystem(stack, "TestFileSystem", {
      vpc: vpc,
    });

    accessPoint = fileSystem.addAccessPoint("TestAccessPoint");
  });

  describe("constructor", () => {
    it("creates ECS service with default configuration", () => {
      const ecsService = new ECSService(stack, "TestECSService", {
        account: testAccount,
        vpc: vpc,
        config: config,
        removalPolicy: RemovalPolicy.DESTROY,
        regionalS3Endpoint: "s3.us-west-2.amazonaws.com",
        jobTable: jobTable,
        jobQueue: jobQueue,
        fileSystem: fileSystem,
        accessPoint: accessPoint,
      });

      expect(ecsService.cluster).toBeDefined();
      expect(ecsService.taskDefinition).toBeDefined();
      expect(ecsService.fargateService).toBeDefined();
      expect(ecsService.alb).toBeDefined();
      expect(ecsService.containerDefinition).toBeDefined();
      expect(ecsService.containerImage).toBeDefined();
      expect(ecsService.logGroup).toBeDefined();
      expect(ecsService.ecsRoles).toBeDefined();
    });

    it("creates ECS service with custom configuration", () => {
      const customConfig = new DataplaneConfig({
        ECS_CLUSTER_NAME: "CustomCluster",
        ECS_CONTAINER_NAME: "CustomContainer",
        CONTAINER_URI: "custom/image:latest",
      });

      const ecsService = new ECSService(stack, "TestECSService", {
        account: testAccount,
        vpc: vpc,
        config: customConfig,
        removalPolicy: RemovalPolicy.DESTROY,
        regionalS3Endpoint: "s3.us-west-2.amazonaws.com",
        jobTable: jobTable,
        jobQueue: jobQueue,
        fileSystem: fileSystem,
        accessPoint: accessPoint,
      });

      expect(ecsService.cluster).toBeDefined();
      expect(ecsService.containerDefinition).toBeDefined();
    });
  });

  describe("ECS cluster creation", () => {
    it("creates cluster with correct properties", () => {
      new ECSService(stack, "TestECSService", {
        account: testAccount,
        vpc: vpc,
        config: config,
        removalPolicy: RemovalPolicy.DESTROY,
        regionalS3Endpoint: "s3.us-west-2.amazonaws.com",
        jobTable: jobTable,
        jobQueue: jobQueue,
        fileSystem: fileSystem,
        accessPoint: accessPoint,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ECS::Cluster", {
        ClusterName: "TSCluster",
        ClusterSettings: [
          {
            Name: "containerInsights",
            Value: "enhanced",
          },
        ],
      });
    });

    it("enables standard container insights for production", () => {
      new ECSService(stack, "TestECSService", {
        account: testProdAccount,
        vpc: vpc,
        config: config,
        removalPolicy: RemovalPolicy.RETAIN,
        regionalS3Endpoint: "s3.us-west-2.amazonaws.com",
        jobTable: jobTable,
        jobQueue: jobQueue,
        fileSystem: fileSystem,
        accessPoint: accessPoint,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ECS::Cluster", {
        ClusterSettings: [
          {
            Name: "containerInsights",
            Value: "enabled",
          },
        ],
      });
    });
  });

  describe("task definition creation", () => {
    it("creates task definition with correct specifications", () => {
      new ECSService(stack, "TestECSService", {
        account: testAccount,
        vpc: vpc,
        config: config,
        removalPolicy: RemovalPolicy.DESTROY,
        regionalS3Endpoint: "s3.us-west-2.amazonaws.com",
        jobTable: jobTable,
        jobQueue: jobQueue,
        fileSystem: fileSystem,
        accessPoint: accessPoint,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ECS::TaskDefinition", {
        Cpu: "8192",
        Memory: "16384",
        NetworkMode: "awsvpc",
        RequiresCompatibilities: ["FARGATE"],
        EphemeralStorage: {
          SizeInGiB: 21,
        },
      });
    });

    it("configures EFS volume correctly", () => {
      new ECSService(stack, "TestECSService", {
        account: testAccount,
        vpc: vpc,
        config: config,
        removalPolicy: RemovalPolicy.DESTROY,
        regionalS3Endpoint: "s3.us-west-2.amazonaws.com",
        jobTable: jobTable,
        jobQueue: jobQueue,
        fileSystem: fileSystem,
        accessPoint: accessPoint,
      });

      const template = Template.fromStack(stack);

      // Verify EFS volume configuration exists
      const taskDefinitions = template.findResources(
        "AWS::ECS::TaskDefinition",
      );
      const taskDefinition = Object.values(taskDefinitions)[0] as unknown;

      const taskDef = taskDefinition as { Properties: { Volumes: unknown[] } };
      expect(taskDef.Properties.Volumes).toBeDefined();
      expect(taskDef.Properties.Volumes).toHaveLength(1);

      const volume = taskDef.Properties.Volumes[0] as {
        Name: string;
        EfsVolumeConfiguration?: unknown;
        EFSVolumeConfiguration?: unknown;
      };
      expect(volume.Name).toBe("ts-efs-volume");

      // Check for EFS volume config (might be under different property name)
      const hasEfsConfig =
        volume.EfsVolumeConfiguration || volume.EFSVolumeConfiguration;
      expect(hasEfsConfig).toBeDefined();
    });

    it("assigns correct task and execution roles", () => {
      new ECSService(stack, "TestECSService", {
        account: testAccount,
        vpc: vpc,
        config: config,
        removalPolicy: RemovalPolicy.DESTROY,
        regionalS3Endpoint: "s3.us-west-2.amazonaws.com",
        jobTable: jobTable,
        jobQueue: jobQueue,
        fileSystem: fileSystem,
        accessPoint: accessPoint,
      });

      const template = Template.fromStack(stack);

      // Should have task definition with role ARNs
      const taskDefinitions = template.findResources(
        "AWS::ECS::TaskDefinition",
      );
      const taskDefinition = Object.values(taskDefinitions)[0] as unknown;
      const taskDef = taskDefinition as {
        Properties: { TaskRoleArn: unknown; ExecutionRoleArn: unknown };
      };

      expect(taskDef.Properties.TaskRoleArn).toBeDefined();
      expect(taskDef.Properties.ExecutionRoleArn).toBeDefined();
    });
  });

  describe("container definition creation", () => {
    it("creates container with correct properties", () => {
      new ECSService(stack, "TestECSService", {
        account: testAccount,
        vpc: vpc,
        config: config,
        removalPolicy: RemovalPolicy.DESTROY,
        regionalS3Endpoint: "s3.us-west-2.amazonaws.com",
        jobTable: jobTable,
        jobQueue: jobQueue,
        fileSystem: fileSystem,
        accessPoint: accessPoint,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ECS::TaskDefinition", {
        ContainerDefinitions: [
          {
            Name: "TSContainer",
            Image: "awsosml/osml-tile-server:latest",
            Cpu: 8192,
            Memory: 16384,
            Essential: true,
            DisableNetworking: false,
            StartTimeout: 60,
            StopTimeout: 60,
          },
        ],
      });
    });

    it("configures container environment variables", () => {
      new ECSService(stack, "TestECSService", {
        account: testAccount,
        vpc: vpc,
        config: config,
        removalPolicy: RemovalPolicy.DESTROY,
        regionalS3Endpoint: "s3.us-west-2.amazonaws.com",
        jobTable: jobTable,
        jobQueue: jobQueue,
        fileSystem: fileSystem,
        accessPoint: accessPoint,
      });

      const template = Template.fromStack(stack);

      // Verify environment variables are set
      const taskDefinitions = template.findResources(
        "AWS::ECS::TaskDefinition",
      );
      const taskDefinition = Object.values(taskDefinitions)[0] as unknown;
      const taskDef = taskDefinition as {
        Properties: {
          ContainerDefinitions: Array<{ Environment: Array<{ Name: string }> }>;
        };
      };
      const containerDef = taskDef.Properties.ContainerDefinitions[0];

      const envVarNames = containerDef.Environment.map(
        (env: { Name: string }) => env.Name,
      );
      expect(envVarNames).toContain("AWS_DEFAULT_REGION");
      expect(envVarNames).toContain("JOB_TABLE");
      expect(envVarNames).toContain("JOB_QUEUE");
      expect(envVarNames).toContain("AWS_S3_ENDPOINT");
      expect(envVarNames).toContain("EFS_MOUNT_NAME");
      expect(envVarNames).toContain("STS_ARN");
    });

    it("includes FASTAPI_ROOT_PATH when configured", () => {
      const customConfig = new DataplaneConfig({
        FASTAPI_ROOT_PATH: "/api/v1",
      });

      new ECSService(stack, "TestECSService", {
        account: testAccount,
        vpc: vpc,
        config: customConfig,
        removalPolicy: RemovalPolicy.DESTROY,
        regionalS3Endpoint: "s3.us-west-2.amazonaws.com",
        jobTable: jobTable,
        jobQueue: jobQueue,
        fileSystem: fileSystem,
        accessPoint: accessPoint,
      });

      const template = Template.fromStack(stack);

      const taskDefinitions = template.findResources(
        "AWS::ECS::TaskDefinition",
      );
      const taskDefinition = Object.values(taskDefinitions)[0] as unknown;
      const taskDef = taskDefinition as {
        Properties: {
          ContainerDefinitions: Array<{ Environment: Array<{ Name: string }> }>;
        };
      };
      const containerDef = taskDef.Properties.ContainerDefinitions[0];

      const envVarNames = containerDef.Environment.map(
        (env: { Name: string }) => env.Name,
      );
      expect(envVarNames).toContain("FASTAPI_ROOT_PATH");
    });

    it("configures health check correctly", () => {
      new ECSService(stack, "TestECSService", {
        account: testAccount,
        vpc: vpc,
        config: config,
        removalPolicy: RemovalPolicy.DESTROY,
        regionalS3Endpoint: "s3.us-west-2.amazonaws.com",
        jobTable: jobTable,
        jobQueue: jobQueue,
        fileSystem: fileSystem,
        accessPoint: accessPoint,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ECS::TaskDefinition", {
        ContainerDefinitions: [
          {
            HealthCheck: {
              Command: [
                "CMD-SHELL",
                "curl --fail http://localhost:8080/ping || exit 1",
              ],
              Interval: 30,
              Retries: 3,
              Timeout: 10,
            },
          },
        ],
      });
    });

    it("configures port mappings correctly", () => {
      new ECSService(stack, "TestECSService", {
        account: testAccount,
        vpc: vpc,
        config: config,
        removalPolicy: RemovalPolicy.DESTROY,
        regionalS3Endpoint: "s3.us-west-2.amazonaws.com",
        jobTable: jobTable,
        jobQueue: jobQueue,
        fileSystem: fileSystem,
        accessPoint: accessPoint,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ECS::TaskDefinition", {
        ContainerDefinitions: [
          {
            PortMappings: [
              {
                ContainerPort: 8080,
                Protocol: "tcp",
              },
            ],
          },
        ],
      });
    });

    it("configures EFS mount points correctly", () => {
      new ECSService(stack, "TestECSService", {
        account: testAccount,
        vpc: vpc,
        config: config,
        removalPolicy: RemovalPolicy.DESTROY,
        regionalS3Endpoint: "s3.us-west-2.amazonaws.com",
        jobTable: jobTable,
        jobQueue: jobQueue,
        fileSystem: fileSystem,
        accessPoint: accessPoint,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ECS::TaskDefinition", {
        ContainerDefinitions: [
          {
            MountPoints: [
              {
                SourceVolume: "ts-efs-volume",
                ContainerPath: "/ts-efs-volume",
                ReadOnly: false,
              },
            ],
          },
        ],
      });
    });
  });

  describe("log group creation", () => {
    it("creates log group with correct properties", () => {
      new ECSService(stack, "TestECSService", {
        account: testAccount,
        vpc: vpc,
        config: config,
        removalPolicy: RemovalPolicy.DESTROY,
        regionalS3Endpoint: "s3.us-west-2.amazonaws.com",
        jobTable: jobTable,
        jobQueue: jobQueue,
        fileSystem: fileSystem,
        accessPoint: accessPoint,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::Logs::LogGroup", {
        LogGroupName: "/aws/OSML/TSService",
        RetentionInDays: 3653, // 10 years
      });
    });

    it("applies correct removal policy to log group", () => {
      new ECSService(stack, "TestECSService", {
        account: testAccount,
        vpc: vpc,
        config: config,
        removalPolicy: RemovalPolicy.RETAIN,
        regionalS3Endpoint: "s3.us-west-2.amazonaws.com",
        jobTable: jobTable,
        jobQueue: jobQueue,
        fileSystem: fileSystem,
        accessPoint: accessPoint,
      });

      const template = Template.fromStack(stack);

      template.hasResource("AWS::Logs::LogGroup", {
        DeletionPolicy: "Retain",
      });
    });
  });

  describe("container image handling", () => {
    it("uses registry image by default", () => {
      new ECSService(stack, "TestECSService", {
        account: testAccount,
        vpc: vpc,
        config: config,
        removalPolicy: RemovalPolicy.DESTROY,
        regionalS3Endpoint: "s3.us-west-2.amazonaws.com",
        jobTable: jobTable,
        jobQueue: jobQueue,
        fileSystem: fileSystem,
        accessPoint: accessPoint,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ECS::TaskDefinition", {
        ContainerDefinitions: [
          {
            Image: "awsosml/osml-tile-server:latest",
          },
        ],
      });
    });

    it("handles custom container URI", () => {
      const customConfig = new DataplaneConfig({
        CONTAINER_URI: "custom/my-tile-server:v2.0",
      });

      new ECSService(stack, "TestECSService", {
        account: testAccount,
        vpc: vpc,
        config: customConfig,
        removalPolicy: RemovalPolicy.DESTROY,
        regionalS3Endpoint: "s3.us-west-2.amazonaws.com",
        jobTable: jobTable,
        jobQueue: jobQueue,
        fileSystem: fileSystem,
        accessPoint: accessPoint,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ECS::TaskDefinition", {
        ContainerDefinitions: [
          {
            Image: "custom/my-tile-server:v2.0",
          },
        ],
      });
    });
  });

  describe("ALB creation", () => {
    it("creates internal load balancer in private subnets", () => {
      new ECSService(stack, "TestECSService", {
        account: testAccount,
        vpc: vpc,
        config: config,
        removalPolicy: RemovalPolicy.DESTROY,
        regionalS3Endpoint: "s3.us-west-2.amazonaws.com",
        jobTable: jobTable,
        jobQueue: jobQueue,
        fileSystem: fileSystem,
        accessPoint: accessPoint,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties(
        "AWS::ElasticLoadBalancingV2::LoadBalancer",
        {
          Type: "application",
          Scheme: "internal",
        },
      );
    });

    it("uses security group when provided", () => {
      const securityGroup = new SecurityGroup(stack, "TestSecurityGroup", {
        vpc: vpc,
        description: "Test security group",
      });

      new ECSService(stack, "TestECSService", {
        account: testAccount,
        vpc: vpc,
        config: config,
        removalPolicy: RemovalPolicy.DESTROY,
        regionalS3Endpoint: "s3.us-west-2.amazonaws.com",
        securityGroups: [securityGroup],
        jobTable: jobTable,
        jobQueue: jobQueue,
        fileSystem: fileSystem,
        accessPoint: accessPoint,
      });

      const template = Template.fromStack(stack);

      // Should create ALB with security groups
      const albs = template.findResources(
        "AWS::ElasticLoadBalancingV2::LoadBalancer",
      );
      const alb = Object.values(albs)[0] as unknown;
      const albProps = alb as { Properties: { SecurityGroups: unknown[] } };

      expect(albProps.Properties.SecurityGroups).toBeDefined();
      expect(albProps.Properties.SecurityGroups).toHaveLength(1);
    });
  });

  describe("Fargate service creation", () => {
    it("creates Fargate service with correct properties", () => {
      new ECSService(stack, "TestECSService", {
        account: testAccount,
        vpc: vpc,
        config: config,
        removalPolicy: RemovalPolicy.DESTROY,
        regionalS3Endpoint: "s3.us-west-2.amazonaws.com",
        jobTable: jobTable,
        jobQueue: jobQueue,
        fileSystem: fileSystem,
        accessPoint: accessPoint,
      });

      const template = Template.fromStack(stack);

      // Verify service has correct launch type and basic configuration
      const services = template.findResources("AWS::ECS::Service");
      const service = Object.values(services)[0] as unknown;
      const serviceProps = service as {
        Properties: {
          LaunchType: string;
          NetworkConfiguration: {
            AwsvpcConfiguration: {
              AssignPublicIp: string;
              SecurityGroups: unknown;
              Subnets: unknown;
            };
          };
          DeploymentConfiguration: {
            MinimumHealthyPercent: number;
          };
        };
      };

      expect(serviceProps.Properties.LaunchType).toBe("FARGATE");
      expect(
        serviceProps.Properties.NetworkConfiguration.AwsvpcConfiguration
          .AssignPublicIp,
      ).toBe("DISABLED");
      expect(
        serviceProps.Properties.NetworkConfiguration.AwsvpcConfiguration
          .SecurityGroups,
      ).toBeDefined();
      expect(
        serviceProps.Properties.NetworkConfiguration.AwsvpcConfiguration
          .Subnets,
      ).toBeDefined();
      expect(
        serviceProps.Properties.DeploymentConfiguration.MinimumHealthyPercent,
      ).toBe(100);
    });

    it("configures target group health check", () => {
      new ECSService(stack, "TestECSService", {
        account: testAccount,
        vpc: vpc,
        config: config,
        removalPolicy: RemovalPolicy.DESTROY,
        regionalS3Endpoint: "s3.us-west-2.amazonaws.com",
        jobTable: jobTable,
        jobQueue: jobQueue,
        fileSystem: fileSystem,
        accessPoint: accessPoint,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties(
        "AWS::ElasticLoadBalancingV2::TargetGroup",
        {
          HealthCheckPath: "/ping",
          HealthCheckPort: "8080",
          HealthCheckProtocol: "HTTP",
          HealthyThresholdCount: 5,
          UnhealthyThresholdCount: 2,
          HealthCheckTimeoutSeconds: 5,
          HealthCheckIntervalSeconds: 30,
        },
      );
    });
  });

  describe("logging configuration", () => {
    it("configures CloudWatch logging correctly", () => {
      new ECSService(stack, "TestECSService", {
        account: testAccount,
        vpc: vpc,
        config: config,
        removalPolicy: RemovalPolicy.DESTROY,
        regionalS3Endpoint: "s3.us-west-2.amazonaws.com",
        jobTable: jobTable,
        jobQueue: jobQueue,
        fileSystem: fileSystem,
        accessPoint: accessPoint,
      });

      const template = Template.fromStack(stack);

      // Verify logging configuration exists
      const taskDefinitions = template.findResources(
        "AWS::ECS::TaskDefinition",
      );
      const taskDefinition = Object.values(taskDefinitions)[0] as unknown;
      const taskDef = taskDefinition as {
        Properties: {
          ContainerDefinitions: Array<{
            LogConfiguration: {
              LogDriver: string;
              Options: Record<string, string>;
            };
          }>;
        };
      };
      const containerDef = taskDef.Properties.ContainerDefinitions[0];

      expect(containerDef.LogConfiguration).toBeDefined();
      expect(containerDef.LogConfiguration.LogDriver).toBe("awslogs");
      expect(
        containerDef.LogConfiguration.Options["awslogs-stream-prefix"],
      ).toBe("OSML");
      expect(containerDef.LogConfiguration.Options["awslogs-region"]).toBe(
        "us-west-2",
      );
    });
  });

  describe("integration scenarios", () => {
    it("handles custom CPU and memory configurations", () => {
      const customConfig = new DataplaneConfig({
        ECS_TASK_CPU: 4096,
        ECS_TASK_MEMORY: 8192,
        ECS_CONTAINER_CPU: 4096,
        ECS_CONTAINER_MEMORY: 8192,
      });

      new ECSService(stack, "TestECSService", {
        account: testAccount,
        vpc: vpc,
        config: customConfig,
        removalPolicy: RemovalPolicy.DESTROY,
        regionalS3Endpoint: "s3.us-west-2.amazonaws.com",
        jobTable: jobTable,
        jobQueue: jobQueue,
        fileSystem: fileSystem,
        accessPoint: accessPoint,
      });

      const template = Template.fromStack(stack);

      // Task definition should have custom values
      template.hasResourceProperties("AWS::ECS::TaskDefinition", {
        Cpu: "4096",
        Memory: "8192",
        ContainerDefinitions: [
          {
            Cpu: 4096,
            Memory: 8192,
          },
        ],
      });
    });

    it("creates all required resources", () => {
      new ECSService(stack, "TestECSService", {
        account: testAccount,
        vpc: vpc,
        config: config,
        removalPolicy: RemovalPolicy.DESTROY,
        regionalS3Endpoint: "s3.us-west-2.amazonaws.com",
        jobTable: jobTable,
        jobQueue: jobQueue,
        fileSystem: fileSystem,
        accessPoint: accessPoint,
      });

      const template = Template.fromStack(stack);

      // Should create cluster
      template.resourceCountIs("AWS::ECS::Cluster", 1);

      // Should create task definition
      template.resourceCountIs("AWS::ECS::TaskDefinition", 1);

      // Should create Fargate service
      template.resourceCountIs("AWS::ECS::Service", 1);

      // Should create ALB
      template.resourceCountIs("AWS::ElasticLoadBalancingV2::LoadBalancer", 1);

      // Should create target group
      template.resourceCountIs("AWS::ElasticLoadBalancingV2::TargetGroup", 1);

      // Should create log group
      template.resourceCountIs("AWS::Logs::LogGroup", 1);

      // Should create IAM roles (task + execution)
      template.resourceCountIs("AWS::IAM::Role", 2);
    });
  });
});
