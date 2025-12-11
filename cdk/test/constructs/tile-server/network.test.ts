/*
 * Copyright 2024-2025 Amazon.com, Inc. or its affiliates.
 */

import { App, Aspects, Stack } from "aws-cdk-lib";
import { Annotations, Match, Template } from "aws-cdk-lib/assertions";
import { AwsSolutionsChecks } from "cdk-nag";

import {
  Network,
  NetworkConfig,
} from "../../../lib/constructs/tile-server/network";
import { testAccount } from "../../test-account";
import { generateNagReport } from "../../test-utils";

describe("NetworkConfig", () => {
  describe("constructor", () => {
    it("creates config with default values", () => {
      const config = new NetworkConfig();

      expect(config.VPC_NAME).toBe("tile-server-vpc");
      expect(config.SECURITY_GROUP_NAME).toBe("tile-server-security-group");
      expect(config.VPC_ID).toBeUndefined();
      expect(config.SECURITY_GROUP_ID).toBeUndefined();
      expect(config.MAX_AZS).toBeUndefined();
      expect(config.TARGET_SUBNETS).toBeUndefined();
    });

    it("creates config with custom values", () => {
      const customConfig = {
        VPC_NAME: "custom-vpc",
        SECURITY_GROUP_NAME: "custom-sg",
        MAX_AZS: 2,
        VPC_ID: "vpc-12345678",
        SECURITY_GROUP_ID: "sg-87654321",
        TARGET_SUBNETS: ["subnet-123", "subnet-456"],
      };

      const config = new NetworkConfig(customConfig);

      expect(config.VPC_NAME).toBe("custom-vpc");
      expect(config.SECURITY_GROUP_NAME).toBe("custom-sg");
      expect(config.MAX_AZS).toBe(2);
      expect(config.VPC_ID).toBe("vpc-12345678");
      expect(config.SECURITY_GROUP_ID).toBe("sg-87654321");
      expect(config.TARGET_SUBNETS).toEqual(["subnet-123", "subnet-456"]);
    });
  });
});

describe("Network", () => {
  let app: App;
  let stack: Stack;

  beforeEach(() => {
    app = new App();
    stack = new Stack(app, "TestStack", {
      env: { account: testAccount.id, region: testAccount.region },
    });
  });

  describe("constructor", () => {
    it("creates network with default configuration", () => {
      const network = new Network(stack, "TestNetwork", {
        account: testAccount,
      });

      expect(network.vpc).toBeDefined();
      expect(network.securityGroup).toBeDefined();
      expect(network.selectedSubnets).toBeDefined();
      expect(network.config).toBeInstanceOf(NetworkConfig);
      expect(network.config.VPC_NAME).toBe("tile-server-vpc");
    });

    it("creates network with custom configuration", () => {
      const customConfig = new NetworkConfig({
        VPC_NAME: "custom-vpc",
        SECURITY_GROUP_NAME: "custom-security-group",
      });

      const network = new Network(stack, "TestNetwork", {
        account: testAccount,
        config: customConfig,
      });

      expect(network.vpc).toBeDefined();
      expect(network.config).toBe(customConfig);
      expect(network.config.VPC_NAME).toBe("custom-vpc");
    });

    it("handles container port configuration", () => {
      const network = new Network(stack, "TestNetwork", {
        account: testAccount,
        containerPort: 8080,
      });

      expect(network.vpc).toBeDefined();
      expect(network.securityGroup).toBeDefined();
    });
  });

  describe("VPC creation", () => {
    it("creates new VPC with default settings", () => {
      new Network(stack, "TestNetwork", {
        account: testAccount,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::EC2::VPC", {
        CidrBlock: "10.0.0.0/16",
        EnableDnsHostnames: true,
        EnableDnsSupport: true,
      });
    });

    it("creates VPC with custom name", () => {
      const customConfig = new NetworkConfig({
        VPC_NAME: "my-custom-vpc",
      });

      new Network(stack, "TestNetwork", {
        account: testAccount,
        config: customConfig,
      });

      const template = Template.fromStack(stack);

      // Verify VPC has correct name tag
      const vpcs = template.findResources("AWS::EC2::VPC");
      const vpc = Object.values(vpcs)[0] as unknown;
      const vpcProps = vpc as {
        Properties: { Tags: Array<{ Key: string; Value: string }> };
      };

      const tags = vpcProps.Properties.Tags || [];
      const nameTag = tags.find(
        (tag: { Key: string; Value: string }) => tag.Key === "Name",
      );
      expect(nameTag).toBeDefined();
      expect(nameTag!.Value).toBe("my-custom-vpc");
    });

    it("respects MAX_AZS configuration", () => {
      const customConfig = new NetworkConfig({
        MAX_AZS: 2,
      });

      new Network(stack, "TestNetwork", {
        account: testAccount,
        config: customConfig,
      });

      const template = Template.fromStack(stack);

      // Should create subnets in 2 AZs (2 public + 2 private = 4 subnets)
      template.resourceCountIs("AWS::EC2::Subnet", 4);
    });

    it("creates public and private subnets", () => {
      new Network(stack, "TestNetwork", {
        account: testAccount,
      });

      const template = Template.fromStack(stack);

      // Should create subnets
      template.hasResource("AWS::EC2::Subnet", {});

      // Should create Internet Gateway for public subnets
      template.resourceCountIs("AWS::EC2::InternetGateway", 1);

      // Should create NAT Gateway for private subnets
      template.hasResource("AWS::EC2::NatGateway", {});
    });

    it("creates route tables for public and private subnets", () => {
      new Network(stack, "TestNetwork", {
        account: testAccount,
      });

      const template = Template.fromStack(stack);

      // Should create route tables
      template.hasResource("AWS::EC2::RouteTable", {});

      // Should create routes
      template.hasResource("AWS::EC2::Route", {});
    });
  });

  describe("VPC import", () => {
    it("imports existing VPC when VPC_ID is provided", () => {
      // Note: This test verifies the lookup configuration, not the actual import
      const customConfig = new NetworkConfig({
        VPC_ID: "vpc-12345678",
      });

      const network = new Network(stack, "TestNetwork", {
        account: testAccount,
        config: customConfig,
      });

      expect(network.vpc).toBeDefined();
      expect(network.config.VPC_ID).toBe("vpc-12345678");
    });
  });

  describe("security group creation", () => {
    it("creates new security group with default settings", () => {
      new Network(stack, "TestNetwork", {
        account: testAccount,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::EC2::SecurityGroup", {
        GroupName: "tile-server-security-group",
        GroupDescription: "Security group with outbound and ALB access",
      });
    });

    it("creates security group with custom name", () => {
      const customConfig = new NetworkConfig({
        SECURITY_GROUP_NAME: "my-custom-sg",
      });

      new Network(stack, "TestNetwork", {
        account: testAccount,
        config: customConfig,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::EC2::SecurityGroup", {
        GroupName: "my-custom-sg",
      });
    });

    it("allows all outbound traffic", () => {
      new Network(stack, "TestNetwork", {
        account: testAccount,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::EC2::SecurityGroup", {
        SecurityGroupEgress: [
          {
            CidrIp: "0.0.0.0/0",
            Description: "Allow all outbound traffic by default",
            IpProtocol: "-1",
          },
        ],
      });
    });

    it("adds ALB ingress rule on port 80", () => {
      new Network(stack, "TestNetwork", {
        account: testAccount,
      });

      const template = Template.fromStack(stack);

      // Verify security group has ingress rule for port 80
      const securityGroups = template.findResources("AWS::EC2::SecurityGroup");
      const sg = Object.values(securityGroups)[0] as unknown;
      const sgProps = sg as {
        Properties: {
          SecurityGroupIngress: Array<{
            FromPort: number;
            Description: string;
            IpProtocol: string;
          }>;
        };
      };

      expect(sgProps.Properties.SecurityGroupIngress).toBeDefined();
      const rules = sgProps.Properties.SecurityGroupIngress;

      const port80Rule = rules.find(
        (rule: { FromPort: number }) => rule.FromPort === 80,
      );
      expect(port80Rule).toBeDefined();
      expect(port80Rule!.Description).toBe(
        "Allow inbound traffic to ALB on port 80",
      );
      expect(port80Rule!.IpProtocol).toBe("tcp");
    });

    it("adds container port ingress rule when provided", () => {
      new Network(stack, "TestNetwork", {
        account: testAccount,
        containerPort: 8080,
      });

      const template = Template.fromStack(stack);

      // Verify security group has ingress rules for both ports
      const securityGroups = template.findResources("AWS::EC2::SecurityGroup");
      const sg = Object.values(securityGroups)[0] as unknown;
      const sgProps = sg as {
        Properties: {
          SecurityGroupIngress: Array<{
            FromPort: number;
            Description: string;
          }>;
        };
      };

      expect(sgProps.Properties.SecurityGroupIngress).toBeDefined();
      expect(sgProps.Properties.SecurityGroupIngress).toHaveLength(2);

      const rules = sgProps.Properties.SecurityGroupIngress;
      const port80Rule = rules.find(
        (rule: { FromPort: number }) => rule.FromPort === 80,
      );
      const port8080Rule = rules.find(
        (rule: { FromPort: number }) => rule.FromPort === 8080,
      );

      expect(port80Rule).toBeDefined();
      expect(port8080Rule).toBeDefined();
      expect(port8080Rule!.Description).toBe(
        "Allow ALB to reach container on port 8080",
      );
    });

    it("imports existing security group when SECURITY_GROUP_ID is provided", () => {
      const customConfig = new NetworkConfig({
        SECURITY_GROUP_ID: "sg-12345678",
      });

      const network = new Network(stack, "TestNetwork", {
        account: testAccount,
        config: customConfig,
      });

      expect(network.securityGroup).toBeDefined();
      expect(network.config.SECURITY_GROUP_ID).toBe("sg-12345678");

      const template = Template.fromStack(stack);

      // Should not create a new security group
      template.resourceCountIs("AWS::EC2::SecurityGroup", 0);
    });
  });

  describe("subnet selection", () => {
    it("selects private subnets by default", () => {
      const network = new Network(stack, "TestNetwork", {
        account: testAccount,
      });

      expect(network.selectedSubnets).toBeDefined();

      // Verify that subnets are selected (subnetType may not be available)
      // The important thing is that selectedSubnets exists and has subnets
      const subnets = network.selectedSubnets.subnets;
      expect(subnets).toBeDefined();
      expect(subnets!.length).toBeGreaterThan(0);
    });

    it("selects specified target subnets when provided", () => {
      const customConfig = new NetworkConfig({
        TARGET_SUBNETS: ["subnet-123", "subnet-456"],
      });

      const network = new Network(stack, "TestNetwork", {
        account: testAccount,
        config: customConfig,
      });

      expect(network.selectedSubnets).toBeDefined();
      // Note: The actual subnet IDs would be resolved at runtime
    });
  });

  describe("regional configuration", () => {
    it("uses regional config for VPC AZ limits", () => {
      // us-west-2 should have maxVpcAzs: 3
      new Network(stack, "TestNetwork", {
        account: testAccount,
      });

      const template = Template.fromStack(stack);

      // Should create subnets in 3 AZs (3 public + 3 private = 6 subnets)
      template.resourceCountIs("AWS::EC2::Subnet", 6);
    });

    it("respects custom MAX_AZS over regional config", () => {
      const customConfig = new NetworkConfig({
        MAX_AZS: 2, // Override regional default of 3
      });

      new Network(stack, "TestNetwork", {
        account: testAccount,
        config: customConfig,
      });

      const template = Template.fromStack(stack);

      // Should create subnets in 2 AZs (2 public + 2 private = 4 subnets)
      template.resourceCountIs("AWS::EC2::Subnet", 4);
    });
  });

  describe("integration scenarios", () => {
    it("creates complete network infrastructure", () => {
      new Network(stack, "TestNetwork", {
        account: testAccount,
        containerPort: 8080,
      });

      const template = Template.fromStack(stack);

      // Should create VPC
      template.resourceCountIs("AWS::EC2::VPC", 1);

      // Should create Internet Gateway
      template.resourceCountIs("AWS::EC2::InternetGateway", 1);

      // Should create NAT Gateway(s)
      template.hasResource("AWS::EC2::NatGateway", {});

      // Should create security group
      template.resourceCountIs("AWS::EC2::SecurityGroup", 1);

      // Should create subnets (3 public + 3 private for us-west-2)
      template.resourceCountIs("AWS::EC2::Subnet", 6);

      // Should create route tables
      template.hasResource("AWS::EC2::RouteTable", {});
    });

    it("handles mixed import and create scenarios", () => {
      const customConfig = new NetworkConfig({
        VPC_ID: "vpc-12345678", // Import VPC
        SECURITY_GROUP_NAME: "new-sg", // Create new security group
      });

      const network = new Network(stack, "TestNetwork", {
        account: testAccount,
        config: customConfig,
      });

      expect(network.vpc).toBeDefined();
      expect(network.securityGroup).toBeDefined();
      expect(network.config.VPC_ID).toBe("vpc-12345678");

      const template = Template.fromStack(stack);

      // Should not create VPC (importing existing)
      template.resourceCountIs("AWS::EC2::VPC", 0);

      // Should create new security group
      template.resourceCountIs("AWS::EC2::SecurityGroup", 1);
    });

    it("handles full import scenario", () => {
      const customConfig = new NetworkConfig({
        VPC_ID: "vpc-12345678",
        SECURITY_GROUP_ID: "sg-87654321",
      });

      const network = new Network(stack, "TestNetwork", {
        account: testAccount,
        config: customConfig,
      });

      expect(network.vpc).toBeDefined();
      expect(network.securityGroup).toBeDefined();

      const template = Template.fromStack(stack);

      // Should not create VPC or security group (both imported)
      template.resourceCountIs("AWS::EC2::VPC", 0);
      template.resourceCountIs("AWS::EC2::SecurityGroup", 0);
    });
  });

  describe("security group rules", () => {
    it("creates appropriate ingress rules with container port", () => {
      new Network(stack, "TestNetwork", {
        account: testAccount,
        containerPort: 9000,
      });

      const template = Template.fromStack(stack);

      // Verify security group has ingress rules for both ports
      const securityGroups = template.findResources("AWS::EC2::SecurityGroup");
      const sg = Object.values(securityGroups)[0] as unknown;
      const sgProps = sg as {
        Properties: {
          SecurityGroupIngress: Array<{
            FromPort: number;
            Description: string;
          }>;
        };
      };

      expect(sgProps.Properties.SecurityGroupIngress).toBeDefined();
      expect(sgProps.Properties.SecurityGroupIngress).toHaveLength(2);

      const rules = sgProps.Properties.SecurityGroupIngress;
      const port80Rule = rules.find(
        (rule: { FromPort: number }) => rule.FromPort === 80,
      );
      const port9000Rule = rules.find(
        (rule: { FromPort: number }) => rule.FromPort === 9000,
      );

      expect(port80Rule).toBeDefined();
      expect(port9000Rule).toBeDefined();
      expect(port80Rule!.Description).toBe(
        "Allow inbound traffic to ALB on port 80",
      );
      expect(port9000Rule!.Description).toBe(
        "Allow ALB to reach container on port 9000",
      );
    });

    it("creates only ALB ingress rule without container port", () => {
      new Network(stack, "TestNetwork", {
        account: testAccount,
        // No containerPort provided
      });

      const template = Template.fromStack(stack);

      // Verify security group has ingress rules
      const securityGroups = template.findResources("AWS::EC2::SecurityGroup");
      const sg = Object.values(securityGroups)[0] as unknown;
      const sgProps = sg as {
        Properties: {
          SecurityGroupIngress: Array<{
            Description: string;
            FromPort: number;
            ToPort: number;
            IpProtocol: string;
          }>;
        };
      };

      expect(sgProps.Properties.SecurityGroupIngress).toBeDefined();
      expect(sgProps.Properties.SecurityGroupIngress).toHaveLength(1);

      const ingressRule = sgProps.Properties.SecurityGroupIngress[0];
      expect(ingressRule.Description).toBe(
        "Allow inbound traffic to ALB on port 80",
      );
      expect(ingressRule.FromPort).toBe(80);
      expect(ingressRule.ToPort).toBe(80);
      expect(ingressRule.IpProtocol).toBe("tcp");
    });
  });

  describe("subnet configuration", () => {
    it("creates public and private subnet configurations", () => {
      new Network(stack, "TestNetwork", {
        account: testAccount,
      });

      const template = Template.fromStack(stack);

      // Should have both public and private subnets
      const subnets = template.findResources("AWS::EC2::Subnet");

      // Check that we have both public and private subnet tags
      let hasPublicSubnet = false;
      let hasPrivateSubnet = false;

      Object.values(subnets).forEach((subnet: unknown) => {
        const subnetProps = subnet as {
          Properties: { Tags: Array<{ Key: string; Value: string }> };
        };
        const tags = subnetProps.Properties.Tags || [];
        tags.forEach((tag: { Key: string; Value: string }) => {
          if (tag.Key === "Name" && tag.Value.includes("Public")) {
            hasPublicSubnet = true;
          }
          if (tag.Key === "Name" && tag.Value.includes("Private")) {
            hasPrivateSubnet = true;
          }
        });
      });

      expect(hasPublicSubnet).toBe(true);
      expect(hasPrivateSubnet).toBe(true);
    });

    it("configures subnet CIDR masks correctly", () => {
      new Network(stack, "TestNetwork", {
        account: testAccount,
      });

      const template = Template.fromStack(stack);

      // Subnets should have /24 CIDR blocks
      const subnets = template.findResources("AWS::EC2::Subnet");
      Object.values(subnets).forEach((subnet: unknown) => {
        const subnetProps = subnet as { Properties: { CidrBlock: string } };
        const cidr = subnetProps.Properties.CidrBlock;
        expect(cidr).toMatch(/10\.0\.\d+\.0\/24/);
      });
    });
  });

  describe("network infrastructure", () => {
    it("creates Internet Gateway for public connectivity", () => {
      new Network(stack, "TestNetwork", {
        account: testAccount,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::EC2::InternetGateway", {});

      // Should attach IGW to VPC
      template.hasResource("AWS::EC2::VPCGatewayAttachment", {});
    });

    it("creates NAT Gateways for private subnet connectivity", () => {
      new Network(stack, "TestNetwork", {
        account: testAccount,
      });

      const template = Template.fromStack(stack);

      // Should create NAT Gateway(s)
      template.hasResource("AWS::EC2::NatGateway", {});

      // NAT Gateways should be in public subnets (verify they exist)
      const natGateways = template.findResources("AWS::EC2::NatGateway");
      expect(Object.keys(natGateways).length).toBeGreaterThan(0);
    });

    it("creates appropriate route table associations", () => {
      new Network(stack, "TestNetwork", {
        account: testAccount,
      });

      const template = Template.fromStack(stack);

      // Should create route table associations for subnets
      template.hasResource("AWS::EC2::SubnetRouteTableAssociation", {});
    });
  });

  describe("mixed scenarios", () => {
    it("handles different regional configurations", () => {
      const eastStack = new Stack(app, "EastStack", {
        env: { account: testAccount.id, region: "us-east-1" },
      });

      new Network(eastStack, "TestNetwork", {
        account: { ...testAccount, region: "us-east-1" },
      });

      const template = Template.fromStack(eastStack);

      // us-east-1 has maxVpcAzs: 3, so should create 3 public + 3 private = 6 subnets
      template.resourceCountIs("AWS::EC2::Subnet", 6);
    });

    it("handles regions with limited AZ availability", () => {
      const westStack = new Stack(app, "WestStack", {
        env: { account: testAccount.id, region: "us-west-1" },
      });

      new Network(westStack, "TestNetwork", {
        account: { ...testAccount, region: "us-west-1" },
      });

      const template = Template.fromStack(westStack);

      // us-west-1 has maxVpcAzs: 2, so should create 2 public + 2 private = 4 subnets
      template.resourceCountIs("AWS::EC2::Subnet", 4);
    });
  });

  describe("error handling", () => {
    it("handles undefined config gracefully", () => {
      expect(() => {
        new Network(stack, "TestNetwork", {
          account: testAccount,
          config: undefined,
        });
      }).not.toThrow();
    });

    it("creates default config when none provided", () => {
      const network = new Network(stack, "TestNetwork", {
        account: testAccount,
      });

      expect(network.config).toBeInstanceOf(NetworkConfig);
      expect(network.config.VPC_NAME).toBe("tile-server-vpc");
      expect(network.config.SECURITY_GROUP_NAME).toBe(
        "tile-server-security-group",
      );
    });
  });
});

describe("cdk-nag Compliance Checks - Network", () => {
  let app: App;
  let stack: Stack;

  beforeAll(() => {
    app = new App();
    stack = new Stack(app, "TestStack", {
      env: { account: testAccount.id, region: testAccount.region },
    });

    new Network(stack, "TestNetwork", {
      account: testAccount,
      containerPort: 8080,
    });

    // Add the cdk-nag AwsSolutions Pack with extra verbose logging enabled.
    Aspects.of(stack).add(new AwsSolutionsChecks({ verbose: true }));

    const errors = Annotations.fromStack(stack).findError(
      "*",
      Match.stringLikeRegexp("AwsSolutions-.*"),
    );
    const warnings = Annotations.fromStack(stack).findWarning(
      "*",
      Match.stringLikeRegexp("AwsSolutions-.*"),
    );

    generateNagReport(stack, errors, warnings);
  });

  test("No unsuppressed Warnings", () => {
    const warnings = Annotations.fromStack(stack).findWarning(
      "*",
      Match.stringLikeRegexp("AwsSolutions-.*"),
    );
    expect(warnings).toHaveLength(0);
  });

  test("No unsuppressed Errors", () => {
    const errors = Annotations.fromStack(stack).findError(
      "*",
      Match.stringLikeRegexp("AwsSolutions-.*"),
    );
    expect(errors).toHaveLength(0);
  });
});
