/*
 * Copyright 2024-2025 Amazon.com, Inc. or its affiliates.
 */

import { App, RemovalPolicy, Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { SecurityGroup, Vpc } from "aws-cdk-lib/aws-ec2";

import {
  Dataplane,
  DataplaneConfig,
} from "../../../lib/constructs/tile-server/dataplane";
import {
  testAccount,
  testAdcAccount,
  testProdAccount,
} from "../../test-account";
import {
  CloudFormationResource,
  ECSEnvironmentVariable,
  ECSTaskDefinitionProperties,
} from "../../test-types";

describe("DataplaneConfig", () => {
  describe("constructor", () => {
    it("creates config with default values", () => {
      const config = new DataplaneConfig();

      expect(config.BUILD_FROM_SOURCE).toBe(false);
      expect(config.CONTAINER_BUILD_PATH).toBe("../");
      expect(config.CONTAINER_BUILD_TARGET).toBe("tile_server");
      expect(config.CONTAINER_DOCKERFILE).toBe("docker/Dockerfile.tile_server");
      expect(config.CONTAINER_URI).toBe("awsosml/osml-tile-server:latest");
      expect(config.CW_LOGGROUP_NAME).toBe("TSService");
      expect(config.CW_METRICS_NAMESPACE).toBe("OSML");
      expect(config.DDB_JOB_TABLE).toBe("TSJobTable");
      expect(config.DDB_TTL_ATTRIBUTE).toBe("expire_time");
      expect(config.EFS_MOUNT_NAME).toBe("ts-efs-volume");
      expect(config.ECS_CONTAINER_CPU).toBe(8192);
      expect(config.ECS_CONTAINER_MEMORY).toBe(16384);
      expect(config.ECS_CONTAINER_NAME).toBe("TSContainer");
      expect(config.ECS_CONTAINER_PORT).toBe(8080);
      expect(config.ECS_CLUSTER_NAME).toBe("TSCluster");
      expect(config.ECS_TASK_CPU).toBe(8192);
      expect(config.ECS_TASK_MEMORY).toBe(16384);
      expect(config.SQS_JOB_QUEUE).toBe("TSJobQueue");
    });

    it("creates config with custom values", () => {
      const customConfig = {
        CONTAINER_URI: "custom/tile-server:v1.0",
        ECS_TASK_CPU: 4096,
        ECS_TASK_MEMORY: 8192,
        DDB_JOB_TABLE: "CustomJobTable",
      };

      const config = new DataplaneConfig(customConfig);

      expect(config.CONTAINER_URI).toBe("custom/tile-server:v1.0");
      expect(config.ECS_TASK_CPU).toBe(4096);
      expect(config.ECS_TASK_MEMORY).toBe(8192);
      expect(config.DDB_JOB_TABLE).toBe("CustomJobTable");
      // Defaults should still be used for non-overridden values
      expect(config.BUILD_FROM_SOURCE).toBe(false);
      expect(config.ECS_CONTAINER_PORT).toBe(8080);
    });
  });

  describe("validation", () => {
    it("validates ECS task CPU constraints", () => {
      expect(() => {
        new DataplaneConfig({ ECS_TASK_CPU: 128 });
      }).toThrow(
        "Configuration validation failed:\nECS_TASK_CPU must be at least 256 (0.25 vCPU)",
      );

      expect(() => {
        new DataplaneConfig({ ECS_TASK_CPU: 32768 });
      }).toThrow(
        "Configuration validation failed:\nECS_TASK_CPU must be at most 16384 (16 vCPU)",
      );
    });

    it("validates ECS task memory constraints", () => {
      expect(() => {
        new DataplaneConfig({ ECS_TASK_MEMORY: 256 });
      }).toThrow(
        "Configuration validation failed:\nECS_TASK_MEMORY must be at least 512 MiB",
      );

      expect(() => {
        new DataplaneConfig({ ECS_TASK_MEMORY: 200000 });
      }).toThrow(
        "Configuration validation failed:\nECS_TASK_MEMORY must be at most 122880 MiB (120 GB)",
      );
    });

    it("shows multiple validation errors", () => {
      expect(() => {
        new DataplaneConfig({
          ECS_TASK_CPU: 128,
          ECS_TASK_MEMORY: 256,
        });
      }).toThrow(
        "Configuration validation failed:\nECS_TASK_CPU must be at least 256 (0.25 vCPU)\nECS_TASK_MEMORY must be at least 512 MiB",
      );
    });

    it("accepts valid ECS configurations", () => {
      expect(() => {
        new DataplaneConfig({
          ECS_TASK_CPU: 1024,
          ECS_TASK_MEMORY: 2048,
        });
      }).not.toThrow();

      expect(() => {
        new DataplaneConfig({
          ECS_TASK_CPU: 16384,
          ECS_TASK_MEMORY: 122880,
        });
      }).not.toThrow();
    });
  });
});

describe("Dataplane", () => {
  let app: App;
  let stack: Stack;
  let vpc: Vpc;

  beforeEach(() => {
    app = new App();
    stack = new Stack(app, "TestStack", {
      env: { account: testAccount.id, region: testAccount.region },
    });
    vpc = new Vpc(stack, "TestVpc");
  });

  describe("constructor", () => {
    it("creates dataplane with default configuration", () => {
      const dataplane = new Dataplane(stack, "TestDataplane", {
        account: testAccount,
        vpc: vpc,
      });

      expect(dataplane.config).toBeInstanceOf(DataplaneConfig);
      expect(dataplane.removalPolicy).toBe(RemovalPolicy.DESTROY);
      expect(dataplane.databaseTables).toBeDefined();
      expect(dataplane.messaging).toBeDefined();
      expect(dataplane.storage).toBeDefined();
      expect(dataplane.ecsService).toBeDefined();
      expect(dataplane.regionalS3Endpoint).toBe("s3.us-west-2.amazonaws.com");
    });

    it("creates dataplane with custom configuration", () => {
      const customConfig = new DataplaneConfig({
        DDB_JOB_TABLE: "CustomJobTable",
        SQS_JOB_QUEUE: "CustomQueue",
      });

      const dataplane = new Dataplane(stack, "TestDataplane", {
        account: testAccount,
        vpc: vpc,
        config: customConfig,
      });

      expect(dataplane.config).toBe(customConfig);
      expect(dataplane.config.DDB_JOB_TABLE).toBe("CustomJobTable");
      expect(dataplane.config.SQS_JOB_QUEUE).toBe("CustomQueue");
    });

    it("sets correct removal policy for production account", () => {
      const dataplane = new Dataplane(stack, "TestDataplane", {
        account: testProdAccount,
        vpc: vpc,
      });

      expect(dataplane.removalPolicy).toBe(RemovalPolicy.RETAIN);
    });

    it("sets correct removal policy for non-production account", () => {
      const dataplane = new Dataplane(stack, "TestDataplane", {
        account: testAccount,
        vpc: vpc,
      });

      expect(dataplane.removalPolicy).toBe(RemovalPolicy.DESTROY);
    });

    it("handles security group from config", () => {
      const config = new DataplaneConfig({
        SECURITY_GROUP_ID: "sg-12345678",
      });

      const dataplane = new Dataplane(stack, "TestDataplane", {
        account: testAccount,
        vpc: vpc,
        config: config,
      });

      expect(dataplane.securityGroups).toBeDefined();
      expect(dataplane.securityGroups).toHaveLength(1);
    });

    it("handles security group from props", () => {
      const securityGroup = new SecurityGroup(stack, "TestSecurityGroup", {
        vpc: vpc,
        description: "Test security group",
      });

      const dataplane = new Dataplane(stack, "TestDataplane", {
        account: testAccount,
        vpc: vpc,
        securityGroup: securityGroup,
      });

      expect(dataplane.securityGroups).toBeDefined();
      expect(dataplane.securityGroups).toHaveLength(1);
      expect(dataplane.securityGroups![0]).toBe(securityGroup);
    });

    it("handles different regional configurations", () => {
      const eastStack = new Stack(app, "EastStack", {
        env: { account: testAccount.id, region: "us-east-1" },
      });
      const eastVpc = new Vpc(eastStack, "EastVpc");

      const dataplane = new Dataplane(eastStack, "TestDataplane", {
        account: { ...testAccount, region: "us-east-1" },
        vpc: eastVpc,
      });

      expect(dataplane.regionalS3Endpoint).toBe("s3.amazonaws.com");
    });
  });

  describe("resource creation", () => {
    it("creates all required AWS resources", () => {
      new Dataplane(stack, "TestDataplane", {
        account: testAccount,
        vpc: vpc,
      });

      const template = Template.fromStack(stack);

      // Should create DynamoDB table
      template.hasResourceProperties("AWS::DynamoDB::Table", {
        TableName: "TSJobTable",
        BillingMode: "PAY_PER_REQUEST",
      });

      // Should create SQS queues
      template.hasResourceProperties("AWS::SQS::Queue", {
        QueueName: "TSJobQueue",
      });

      template.hasResourceProperties("AWS::SQS::Queue", {
        QueueName: "TSJobQueue-dlq",
      });

      // Should create EFS filesystem
      template.hasResource("AWS::EFS::FileSystem", {});

      // Should create ECS cluster
      template.hasResourceProperties("AWS::ECS::Cluster", {
        ClusterName: "TSCluster",
      });

      // Should create ECS service
      template.hasResource("AWS::ECS::Service", {});

      // Should create task definition
      template.hasResource("AWS::ECS::TaskDefinition", {});
    });

    it("creates backup resources for production accounts", () => {
      new Dataplane(stack, "TestDataplane", {
        account: testProdAccount,
        vpc: vpc,
      });

      const template = Template.fromStack(stack);

      // Should create backup vault
      template.hasResource("AWS::Backup::BackupVault", {});

      // Should create backup plan
      template.hasResource("AWS::Backup::BackupPlan", {});

      // Should create backup selection
      template.hasResource("AWS::Backup::BackupSelection", {});
    });

    it("does not create backup resources for ADC accounts", () => {
      new Dataplane(stack, "TestDataplane", {
        account: testAdcAccount,
        vpc: vpc,
      });

      const template = Template.fromStack(stack);

      // Should not create backup resources
      template.resourceCountIs("AWS::Backup::BackupVault", 0);
      template.resourceCountIs("AWS::Backup::BackupPlan", 0);
      template.resourceCountIs("AWS::Backup::BackupSelection", 0);
    });

    it("does not create backup resources for non-production accounts", () => {
      new Dataplane(stack, "TestDataplane", {
        account: testAccount,
        vpc: vpc,
      });

      const template = Template.fromStack(stack);

      // Should not create backup resources
      template.resourceCountIs("AWS::Backup::BackupVault", 0);
      template.resourceCountIs("AWS::Backup::BackupPlan", 0);
      template.resourceCountIs("AWS::Backup::BackupSelection", 0);
    });
  });

  describe("resource integration", () => {
    it("grants EFS access to ECS task role", () => {
      new Dataplane(stack, "TestDataplane", {
        account: testAccount,
        vpc: vpc,
      });

      const template = Template.fromStack(stack);

      // Should create IAM policy for EFS client access
      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: [
            {
              Effect: "Allow",
              Action: [
                "elasticfilesystem:ClientMount",
                "elasticfilesystem:ClientWrite",
                "elasticfilesystem:ClientRootAccess",
              ],
            },
          ],
        },
      });
    });

    it("configures task definition with environment variables", () => {
      const config = new DataplaneConfig({
        DDB_JOB_TABLE: "CustomJobTable",
        SQS_JOB_QUEUE: "CustomQueue",
        CW_LOGGROUP_NAME: "CustomLogGroup",
      });

      new Dataplane(stack, "TestDataplane", {
        account: testAccount,
        vpc: vpc,
        config: config,
      });

      const template = Template.fromStack(stack);

      // Task definition should exist and have container definitions
      template.hasResource("AWS::ECS::TaskDefinition", {});

      // Verify key environment variables are present in the task definition
      const taskDefinitions = template.findResources(
        "AWS::ECS::TaskDefinition",
      );
      const taskDefinition = Object.values(
        taskDefinitions,
      )[0] as CloudFormationResource;
      const taskDefProps =
        taskDefinition.Properties as unknown as ECSTaskDefinitionProperties;
      const containerDef = taskDefProps.ContainerDefinitions[0];

      expect(containerDef.Environment).toBeDefined();
      expect(containerDef.Environment.length).toBeGreaterThan(0);

      // Check that required environment variables exist
      const envVarNames = containerDef.Environment.map(
        (env: ECSEnvironmentVariable) => env.Name,
      );
      expect(envVarNames).toContain("JOB_TABLE");
      expect(envVarNames).toContain("JOB_QUEUE");
      expect(envVarNames).toContain("AWS_DEFAULT_REGION");
    });
  });
});
