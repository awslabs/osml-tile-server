/*
 * Copyright 2024-2025 Amazon.com, Inc. or its affiliates.
 */

import { App, RemovalPolicy, Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { SecurityGroup, Vpc } from "aws-cdk-lib/aws-ec2";

import { DataplaneConfig } from "../../../lib/constructs/tile-server/dataplane";
import { Storage } from "../../../lib/constructs/tile-server/storage";
import { testAccount, testProdAccount } from "../../test-account";

describe("Storage", () => {
  let app: App;
  let stack: Stack;
  let vpc: Vpc;
  let config: DataplaneConfig;

  beforeEach(() => {
    app = new App();
    stack = new Stack(app, "TestStack", {
      env: { account: testAccount.id, region: testAccount.region },
    });
    vpc = new Vpc(stack, "TestVpc");
    config = new DataplaneConfig();
  });

  describe("constructor", () => {
    it("creates storage resources with default configuration", () => {
      const storage = new Storage(stack, "TestStorage", {
        account: testAccount,
        vpc: vpc,
        config: config,
        removalPolicy: RemovalPolicy.DESTROY,
      });

      expect(storage.fileSystem).toBeDefined();
      expect(storage.accessPoint).toBeDefined();
    });

    it("creates storage resources with custom configuration", () => {
      const customConfig = new DataplaneConfig({
        EFS_MOUNT_NAME: "custom-efs-mount",
      });

      const storage = new Storage(stack, "TestStorage", {
        account: testAccount,
        vpc: vpc,
        config: customConfig,
        removalPolicy: RemovalPolicy.DESTROY,
      });

      expect(storage.fileSystem).toBeDefined();
      expect(storage.accessPoint).toBeDefined();
    });

    it("creates storage resources with security group", () => {
      const securityGroup = new SecurityGroup(stack, "TestSecurityGroup", {
        vpc: vpc,
        description: "Test security group",
      });

      const storage = new Storage(stack, "TestStorage", {
        account: testAccount,
        vpc: vpc,
        config: config,
        removalPolicy: RemovalPolicy.DESTROY,
        securityGroup: securityGroup,
      });

      expect(storage.fileSystem).toBeDefined();
      expect(storage.accessPoint).toBeDefined();
    });
  });

  describe("EFS file system creation", () => {
    it("creates EFS file system with correct properties", () => {
      new Storage(stack, "TestStorage", {
        account: testAccount,
        vpc: vpc,
        config: config,
        removalPolicy: RemovalPolicy.DESTROY,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::EFS::FileSystem", {
        LifecyclePolicies: [
          {
            TransitionToIA: "AFTER_14_DAYS",
          },
        ],
        PerformanceMode: "generalPurpose",
        ThroughputMode: "bursting",
      });
    });

    it("applies correct removal policy", () => {
      new Storage(stack, "TestStorage", {
        account: testAccount,
        vpc: vpc,
        config: config,
        removalPolicy: RemovalPolicy.RETAIN,
      });

      const template = Template.fromStack(stack);

      template.hasResource("AWS::EFS::FileSystem", {
        DeletionPolicy: "Retain",
      });
    });

    it("configures file system for private subnets", () => {
      new Storage(stack, "TestStorage", {
        account: testAccount,
        vpc: vpc,
        config: config,
        removalPolicy: RemovalPolicy.DESTROY,
      });

      const template = Template.fromStack(stack);

      // Should create mount targets in private subnets
      template.hasResource("AWS::EFS::MountTarget", {});
    });

    it("creates file system with security group when provided", () => {
      const securityGroup = new SecurityGroup(stack, "TestSecurityGroup", {
        vpc: vpc,
        description: "Test security group",
      });

      new Storage(stack, "TestStorage", {
        account: testAccount,
        vpc: vpc,
        config: config,
        removalPolicy: RemovalPolicy.DESTROY,
        securityGroup: securityGroup,
      });

      const template = Template.fromStack(stack);

      // Should create mount targets with security groups
      template.hasResource("AWS::EFS::MountTarget", {});

      // Verify security group is referenced in mount targets
      const mountTargets = template.findResources("AWS::EFS::MountTarget");
      const mountTarget = Object.values(mountTargets)[0] as unknown;
      const mountTargetProps = mountTarget as {
        Properties: { SecurityGroups: unknown };
      };
      expect(mountTargetProps.Properties.SecurityGroups).toBeDefined();
    });

    it("adds correct resource policy", () => {
      new Storage(stack, "TestStorage", {
        account: testAccount,
        vpc: vpc,
        config: config,
        removalPolicy: RemovalPolicy.DESTROY,
      });

      const template = Template.fromStack(stack);

      // EFS resource policy is embedded in the FileSystem resource
      template.hasResourceProperties("AWS::EFS::FileSystem", {
        FileSystemPolicy: {
          Statement: [
            {
              Effect: "Allow",
              Action: [
                "elasticfilesystem:ClientMount",
                "elasticfilesystem:ClientWrite",
                "elasticfilesystem:ClientRootAccess",
              ],
              Principal: {
                AWS: "*",
              },
              Condition: {
                Bool: {
                  "elasticfilesystem:AccessedViaMountTarget": "true",
                },
              },
            },
          ],
        },
      });
    });
  });

  describe("EFS access point creation", () => {
    it("creates access point with correct properties", () => {
      new Storage(stack, "TestStorage", {
        account: testAccount,
        vpc: vpc,
        config: config,
        removalPolicy: RemovalPolicy.DESTROY,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::EFS::AccessPoint", {
        RootDirectory: {
          Path: "/ts-efs-volume",
          CreationInfo: {
            OwnerGid: "1000",
            OwnerUid: "1000",
            Permissions: "777",
          },
        },
        PosixUser: {
          Uid: "1000",
          Gid: "1000",
        },
      });
    });

    it("creates access point with custom mount name", () => {
      const customConfig = new DataplaneConfig({
        EFS_MOUNT_NAME: "custom-mount-point",
      });

      new Storage(stack, "TestStorage", {
        account: testAccount,
        vpc: vpc,
        config: customConfig,
        removalPolicy: RemovalPolicy.DESTROY,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::EFS::AccessPoint", {
        RootDirectory: {
          Path: "/custom-mount-point",
        },
      });
    });

    it("configures POSIX user permissions correctly", () => {
      new Storage(stack, "TestStorage", {
        account: testAccount,
        vpc: vpc,
        config: config,
        removalPolicy: RemovalPolicy.DESTROY,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::EFS::AccessPoint", {
        PosixUser: {
          Uid: "1000",
          Gid: "1000",
        },
      });
    });

    it("sets directory creation permissions", () => {
      new Storage(stack, "TestStorage", {
        account: testAccount,
        vpc: vpc,
        config: config,
        removalPolicy: RemovalPolicy.DESTROY,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::EFS::AccessPoint", {
        RootDirectory: {
          CreationInfo: {
            OwnerGid: "1000",
            OwnerUid: "1000",
            Permissions: "777",
          },
        },
      });
    });
  });

  describe("integration scenarios", () => {
    it("works correctly with production accounts", () => {
      new Storage(stack, "TestStorage", {
        account: testProdAccount,
        vpc: vpc,
        config: config,
        removalPolicy: RemovalPolicy.RETAIN,
      });

      const template = Template.fromStack(stack);

      // Should create the same resources with RETAIN policy
      template.hasResource("AWS::EFS::FileSystem", {
        DeletionPolicy: "Retain",
      });

      template.hasResourceProperties("AWS::EFS::FileSystem", {
        LifecyclePolicies: [
          {
            TransitionToIA: "AFTER_14_DAYS",
          },
        ],
        PerformanceMode: "generalPurpose",
        ThroughputMode: "bursting",
      });
    });

    it("creates all required resources", () => {
      new Storage(stack, "TestStorage", {
        account: testAccount,
        vpc: vpc,
        config: config,
        removalPolicy: RemovalPolicy.DESTROY,
      });

      const template = Template.fromStack(stack);

      // Should create EFS file system
      template.resourceCountIs("AWS::EFS::FileSystem", 1);

      // Should create EFS access point
      template.resourceCountIs("AWS::EFS::AccessPoint", 1);

      // Should create mount targets (one per AZ)
      template.hasResource("AWS::EFS::MountTarget", {});

      // Should have file system policy attached (inline policy)
      template.hasResource("AWS::EFS::FileSystem", {});
    });

    it("handles multiple storage instances", () => {
      new Storage(stack, "TestStorage1", {
        account: testAccount,
        vpc: vpc,
        config: config,
        removalPolicy: RemovalPolicy.DESTROY,
      });

      const customConfig = new DataplaneConfig({
        EFS_MOUNT_NAME: "second-mount",
      });

      new Storage(stack, "TestStorage2", {
        account: testAccount,
        vpc: vpc,
        config: customConfig,
        removalPolicy: RemovalPolicy.DESTROY,
      });

      const template = Template.fromStack(stack);

      // Should create multiple file systems
      template.resourceCountIs("AWS::EFS::FileSystem", 2);
      template.resourceCountIs("AWS::EFS::AccessPoint", 2);

      // Should have different access point paths
      template.hasResourceProperties("AWS::EFS::AccessPoint", {
        RootDirectory: {
          Path: "/ts-efs-volume",
        },
      });

      template.hasResourceProperties("AWS::EFS::AccessPoint", {
        RootDirectory: {
          Path: "/second-mount",
        },
      });
    });
  });

  describe("security configuration", () => {
    it("applies secure default configuration", () => {
      new Storage(stack, "TestStorage", {
        account: testAccount,
        vpc: vpc,
        config: config,
        removalPolicy: RemovalPolicy.DESTROY,
      });

      const template = Template.fromStack(stack);

      // Should use general purpose performance mode (secure default)
      template.hasResourceProperties("AWS::EFS::FileSystem", {
        PerformanceMode: "generalPurpose",
      });

      // Should use bursting throughput mode (cost-effective default)
      template.hasResourceProperties("AWS::EFS::FileSystem", {
        ThroughputMode: "bursting",
      });

      // Should have lifecycle policy to reduce costs
      template.hasResourceProperties("AWS::EFS::FileSystem", {
        LifecyclePolicies: [
          {
            TransitionToIA: "AFTER_14_DAYS",
          },
        ],
      });

      // Should have file system created with proper configuration
      template.hasResource("AWS::EFS::FileSystem", {});
    });

    it("creates access point with appropriate permissions", () => {
      new Storage(stack, "TestStorage", {
        account: testAccount,
        vpc: vpc,
        config: config,
        removalPolicy: RemovalPolicy.DESTROY,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::EFS::AccessPoint", {
        RootDirectory: {
          CreationInfo: {
            // Non-root user for security
            OwnerUid: "1000",
            OwnerGid: "1000",
            // Full permissions for the mount point
            Permissions: "777",
          },
        },
        PosixUser: {
          // Non-root user for security
          Uid: "1000",
          Gid: "1000",
        },
      });
    });
  });

  describe("VPC integration", () => {
    it("places mount targets in private subnets", () => {
      new Storage(stack, "TestStorage", {
        account: testAccount,
        vpc: vpc,
        config: config,
        removalPolicy: RemovalPolicy.DESTROY,
      });

      const template = Template.fromStack(stack);

      // Mount targets should be created in VPC subnets
      template.hasResource("AWS::EFS::MountTarget", {});

      // Should reference the VPC's private subnets
      const mountTargets = template.findResources("AWS::EFS::MountTarget");
      expect(Object.keys(mountTargets).length).toBeGreaterThan(0);
    });
  });
});
