/*
 * Copyright 2024-2025 Amazon.com, Inc. or its affiliates.
 */

import { App, Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { Role } from "aws-cdk-lib/aws-iam";

import { ECSRoles } from "../../../lib/constructs/tile-server/ecs-roles";
import { testAccount, testAdcAccount } from "../../test-account";
import {
  CloudFormationResource,
  IAMManagedPolicyProperties,
  IAMPolicyStatement,
} from "../../test-types";

describe("ECSRoles", () => {
  let app: App;
  let stack: Stack;

  beforeEach(() => {
    app = new App();
    stack = new Stack(app, "TestStack", {
      env: { account: testAccount.id, region: testAccount.region },
    });
  });

  describe("constructor", () => {
    it("creates ECS roles with default configuration", () => {
      const ecsRoles = new ECSRoles(stack, "TestECSRoles", {
        account: testAccount,
        taskRoleName: "TestTaskRole",
        executionRoleName: "TestExecutionRole",
      });

      expect(ecsRoles.taskRole).toBeDefined();
      expect(ecsRoles.executionRole).toBeDefined();
      expect(ecsRoles.partition).toBe("aws");
    });

    it("uses existing roles when provided", () => {
      const existingTaskRole = Role.fromRoleArn(
        stack,
        "ExistingTaskRole",
        `arn:aws:iam::${testAccount.id}:role/ExistingTaskRole`,
      );

      const existingExecutionRole = Role.fromRoleArn(
        stack,
        "ExistingExecutionRole",
        `arn:aws:iam::${testAccount.id}:role/ExistingExecutionRole`,
      );

      const ecsRoles = new ECSRoles(stack, "TestECSRoles", {
        account: testAccount,
        taskRoleName: "TestTaskRole",
        executionRoleName: "TestExecutionRole",
        existingTaskRole: existingTaskRole,
        existingExecutionRole: existingExecutionRole,
      });

      expect(ecsRoles.taskRole).toBe(existingTaskRole);
      expect(ecsRoles.executionRole).toBe(existingExecutionRole);
    });

    it("handles ADC account partition correctly", () => {
      const ecsRoles = new ECSRoles(stack, "TestECSRoles", {
        account: testAdcAccount,
        taskRoleName: "TestTaskRole",
        executionRoleName: "TestExecutionRole",
      });

      expect(ecsRoles.partition).toBe("aws-iso-b");
    });
  });

  describe("task role creation", () => {
    it("creates task role with correct properties", () => {
      new ECSRoles(stack, "TestECSRoles", {
        account: testAccount,
        taskRoleName: "TestTaskRole",
        executionRoleName: "TestExecutionRole",
      });

      const template = Template.fromStack(stack);

      // Should create task role with correct name
      template.hasResourceProperties("AWS::IAM::Role", {
        RoleName: "TestTaskRole",
        Description:
          "Allows access necessary AWS services (SQS, DynamoDB, ...)",
      });

      // Should have assume role policy with correct principals
      const roles = template.findResources("AWS::IAM::Role");
      const taskRole = Object.values(roles).find(
        (role: unknown) =>
          (role as CloudFormationResource).Properties &&
          ((role as CloudFormationResource).Properties as { RoleName: string })
            .RoleName === "TestTaskRole",
      ) as CloudFormationResource;

      const roleProps = taskRole.Properties as {
        AssumeRolePolicyDocument: { Statement: unknown[] };
      };
      expect(roleProps.AssumeRolePolicyDocument.Statement).toBeDefined();
      expect(
        roleProps.AssumeRolePolicyDocument.Statement.length,
      ).toBeGreaterThan(0);
    });

    it("creates task role managed policy with comprehensive permissions", () => {
      new ECSRoles(stack, "TestECSRoles", {
        account: testAccount,
        taskRoleName: "TestTaskRole",
        executionRoleName: "TestExecutionRole",
      });

      const template = Template.fromStack(stack);

      // Verify task policy exists with correct name
      template.hasResourceProperties("AWS::IAM::ManagedPolicy", {
        ManagedPolicyName: "TileServerEcsTaskPolicy",
      });

      // Find the policy and verify it has comprehensive statements
      const policies = template.findResources("AWS::IAM::ManagedPolicy");
      const taskPolicy = Object.values(policies).find(
        (policy: unknown) =>
          (policy as CloudFormationResource).Properties &&
          (
            (policy as CloudFormationResource)
              .Properties as unknown as IAMManagedPolicyProperties
          ).ManagedPolicyName === "TileServerEcsTaskPolicy",
      ) as CloudFormationResource;

      expect(taskPolicy).toBeDefined();
      const policyProps =
        taskPolicy.Properties as unknown as IAMManagedPolicyProperties;
      expect(policyProps.PolicyDocument.Statement).toBeDefined();
      expect(policyProps.PolicyDocument.Statement.length).toBeGreaterThan(5); // Should have multiple statements
    });
  });

  describe("execution role creation", () => {
    it("creates execution role with correct properties", () => {
      new ECSRoles(stack, "TestECSRoles", {
        account: testAccount,
        taskRoleName: "TestTaskRole",
        executionRoleName: "TestExecutionRole",
      });

      const template = Template.fromStack(stack);

      // Should create execution role with correct name and description
      template.hasResourceProperties("AWS::IAM::Role", {
        RoleName: "TestExecutionRole",
        Description:
          "Allows the Oversight Tile Server to access necessary AWS services to boot up the ECS task...",
      });
    });

    it("creates execution role managed policy with ECR and CloudWatch permissions", () => {
      new ECSRoles(stack, "TestECSRoles", {
        account: testAccount,
        taskRoleName: "TestTaskRole",
        executionRoleName: "TestExecutionRole",
      });

      const template = Template.fromStack(stack);

      // Verify execution policy exists and has ECR permissions
      template.hasResourceProperties("AWS::IAM::ManagedPolicy", {
        ManagedPolicyName: "TileServerExecutionPolicy",
      });

      const policies = template.findResources("AWS::IAM::ManagedPolicy");
      const executionPolicy = Object.values(policies).find(
        (policy: unknown) =>
          (policy as CloudFormationResource).Properties &&
          (
            (policy as CloudFormationResource)
              .Properties as unknown as IAMManagedPolicyProperties
          ).ManagedPolicyName === "TileServerExecutionPolicy",
      ) as CloudFormationResource;

      expect(executionPolicy).toBeDefined();
      const execPolicyProps =
        executionPolicy.Properties as unknown as IAMManagedPolicyProperties;
      const statements = execPolicyProps.PolicyDocument.Statement;
      expect(statements).toBeDefined();

      // Verify key ECR actions are present
      const allActions = statements.flatMap(
        (stmt: IAMPolicyStatement) => stmt.Action,
      );
      expect(allActions).toContain("ecr:GetAuthorizationToken");
      expect(allActions).toContain("ecr:BatchGetImage");
      expect(allActions).toContain("logs:CreateLogGroup");
    });
  });

  describe("partition handling", () => {
    it("correctly identifies AWS partition for standard regions", () => {
      const ecsRoles = new ECSRoles(stack, "TestECSRoles", {
        account: testAccount,
        taskRoleName: "TestTaskRole",
        executionRoleName: "TestExecutionRole",
      });

      expect(ecsRoles.partition).toBe("aws");
    });

    it("correctly identifies AWS ISO-B partition for ADC regions", () => {
      const adcStack = new Stack(app, "ADCStack", {
        env: { account: testAdcAccount.id, region: testAdcAccount.region },
      });

      const ecsRoles = new ECSRoles(adcStack, "TestECSRoles", {
        account: testAdcAccount,
        taskRoleName: "TestTaskRole",
        executionRoleName: "TestExecutionRole",
      });

      expect(ecsRoles.partition).toBe("aws-iso-b");
    });

    it("creates ARNs with correct partition in task role policies", () => {
      new ECSRoles(stack, "TestECSRoles", {
        account: testAccount,
        taskRoleName: "TestTaskRole",
        executionRoleName: "TestExecutionRole",
      });

      const template = Template.fromStack(stack);

      // Verify policies exist and contain AWS partition ARNs
      const policies = template.findResources("AWS::IAM::ManagedPolicy");
      const taskPolicy = Object.values(policies).find(
        (policy: unknown) =>
          (policy as CloudFormationResource).Properties &&
          (
            (policy as CloudFormationResource)
              .Properties as unknown as IAMManagedPolicyProperties
          ).ManagedPolicyName === "TileServerEcsTaskPolicy",
      ) as CloudFormationResource;

      expect(taskPolicy).toBeDefined();
      const policyProps =
        taskPolicy.Properties as unknown as IAMManagedPolicyProperties;
      const allResources = policyProps.PolicyDocument.Statement.flatMap(
        (stmt: IAMPolicyStatement) => stmt.Resource || [],
      );

      // Should have AWS partition ARNs (not ADC or other partitions)
      expect(
        allResources.some((resource: string) => resource.includes("arn:aws:")),
      ).toBe(true);
      expect(
        allResources.some((resource: string) =>
          resource.includes("arn:aws:s3:"),
        ),
      ).toBe(true);
    });
  });

  describe("role integration", () => {
    it("creates both roles and policies", () => {
      new ECSRoles(stack, "TestECSRoles", {
        account: testAccount,
        taskRoleName: "TestTaskRole",
        executionRoleName: "TestExecutionRole",
      });

      const template = Template.fromStack(stack);

      // Should create 2 roles
      template.resourceCountIs("AWS::IAM::Role", 2);

      // Should create 2 managed policies
      template.resourceCountIs("AWS::IAM::ManagedPolicy", 2);

      // Verify policies are created with correct names
      template.hasResourceProperties("AWS::IAM::ManagedPolicy", {
        ManagedPolicyName: "TileServerEcsTaskPolicy",
      });

      template.hasResourceProperties("AWS::IAM::ManagedPolicy", {
        ManagedPolicyName: "TileServerExecutionPolicy",
      });
    });

    it("handles mixed existing and new roles", () => {
      const existingTaskRole = Role.fromRoleArn(
        stack,
        "ExistingTaskRole",
        `arn:aws:iam::${testAccount.id}:role/ExistingTaskRole`,
      );

      const ecsRoles = new ECSRoles(stack, "TestECSRoles", {
        account: testAccount,
        taskRoleName: "TestTaskRole",
        executionRoleName: "TestExecutionRole",
        existingTaskRole: existingTaskRole,
      });

      // Should use existing task role but create new execution role
      expect(ecsRoles.taskRole).toBe(existingTaskRole);
      expect(ecsRoles.executionRole).toBeDefined();
      expect(ecsRoles.executionRole).not.toBe(existingTaskRole);

      const template = Template.fromStack(stack);

      // Should create only 1 role (execution role, task role is existing)
      template.resourceCountIs("AWS::IAM::Role", 1);

      // Should still create execution role
      template.hasResourceProperties("AWS::IAM::Role", {
        RoleName: "TestExecutionRole",
      });
    });
  });

  describe("security permissions", () => {
    it("includes all required service permissions in task role", () => {
      new ECSRoles(stack, "TestECSRoles", {
        account: testAccount,
        taskRoleName: "TestTaskRole",
        executionRoleName: "TestExecutionRole",
      });

      const template = Template.fromStack(stack);

      // Verify task policy exists and has comprehensive statements
      const policies = template.findResources("AWS::IAM::ManagedPolicy");
      const taskPolicy = Object.values(policies).find(
        (policy: unknown) =>
          (policy as CloudFormationResource).Properties &&
          (
            (policy as CloudFormationResource)
              .Properties as unknown as IAMManagedPolicyProperties
          ).ManagedPolicyName === "TileServerEcsTaskPolicy",
      ) as CloudFormationResource;

      expect(taskPolicy).toBeDefined();
      const taskPolicyProps =
        taskPolicy.Properties as unknown as IAMManagedPolicyProperties;
      const statements = taskPolicyProps.PolicyDocument.Statement;
      expect(statements).toBeDefined();
      expect(statements.length).toBeGreaterThan(5); // Multiple service permissions

      // Verify key actions are present somewhere in the policy
      const allActions = statements.flatMap(
        (stmt: IAMPolicyStatement) => stmt.Action,
      );
      expect(allActions).toContain("sts:AssumeRole");
      expect(allActions).toContain("s3:GetObject");
      expect(allActions).toContain("dynamodb:PutItem");
    });

    it("includes required ECR permissions in execution role", () => {
      new ECSRoles(stack, "TestECSRoles", {
        account: testAccount,
        taskRoleName: "TestTaskRole",
        executionRoleName: "TestExecutionRole",
      });

      const template = Template.fromStack(stack);

      // Verify execution policy exists and has ECR permissions
      const policies = template.findResources("AWS::IAM::ManagedPolicy");
      const executionPolicy = Object.values(policies).find(
        (policy: unknown) =>
          (policy as CloudFormationResource).Properties &&
          (
            (policy as CloudFormationResource)
              .Properties as unknown as IAMManagedPolicyProperties
          ).ManagedPolicyName === "TileServerExecutionPolicy",
      ) as CloudFormationResource;

      expect(executionPolicy).toBeDefined();
      const execPolicyProps =
        executionPolicy.Properties as unknown as IAMManagedPolicyProperties;
      const statements = execPolicyProps.PolicyDocument.Statement;
      expect(statements).toBeDefined();

      // Verify key ECR actions are present
      const allActions = statements.flatMap(
        (stmt: IAMPolicyStatement) => stmt.Action,
      );
      expect(allActions).toContain("ecr:GetAuthorizationToken");
      expect(allActions).toContain("ecr:BatchGetImage");
      expect(allActions).toContain("logs:CreateLogGroup");
    });
  });

  describe("resource ARN construction", () => {
    it("constructs correct ARNs for standard AWS partition", () => {
      new ECSRoles(stack, "TestECSRoles", {
        account: testAccount,
        taskRoleName: "TestTaskRole",
        executionRoleName: "TestExecutionRole",
      });

      const template = Template.fromStack(stack);

      // Verify policies exist and contain AWS partition ARNs
      const policies = template.findResources("AWS::IAM::ManagedPolicy");
      const taskPolicy = Object.values(policies).find(
        (policy: unknown) =>
          (policy as { Properties: { ManagedPolicyName: string } }).Properties
            .ManagedPolicyName === "TileServerEcsTaskPolicy",
      ) as unknown;

      expect(taskPolicy).toBeDefined();
      const policyProps = taskPolicy as {
        Properties: {
          PolicyDocument: { Statement: Array<{ Resource?: string[] }> };
        };
      };
      const allResources =
        policyProps.Properties.PolicyDocument.Statement.flatMap(
          (stmt: { Resource?: string[] }) => stmt.Resource || [],
        );

      // Should have AWS partition ARNs
      expect(
        allResources.some((resource: string) => resource.includes("arn:aws:")),
      ).toBe(true);
    });

    it("constructs correct ARNs for ADC partition", () => {
      const adcStack = new Stack(app, "ADCStack", {
        env: { account: testAdcAccount.id, region: testAdcAccount.region },
      });

      new ECSRoles(adcStack, "TestECSRoles", {
        account: testAdcAccount,
        taskRoleName: "TestTaskRole",
        executionRoleName: "TestExecutionRole",
      });

      const template = Template.fromStack(adcStack);

      // Verify policies contain ADC partition ARNs
      const policies = template.findResources("AWS::IAM::ManagedPolicy");
      const taskPolicy = Object.values(policies).find(
        (policy: unknown) =>
          (policy as { Properties: { ManagedPolicyName: string } }).Properties
            .ManagedPolicyName === "TileServerEcsTaskPolicy",
      ) as unknown;

      expect(taskPolicy).toBeDefined();
      const policyProps = taskPolicy as {
        Properties: {
          PolicyDocument: { Statement: Array<{ Resource?: string[] }> };
        };
      };
      const allResources =
        policyProps.Properties.PolicyDocument.Statement.flatMap(
          (stmt: { Resource?: string[] }) => stmt.Resource || [],
        );

      // Should have AWS ISO-B partition ARNs
      expect(
        allResources.some((resource: string) =>
          resource.includes("arn:aws-iso-b:"),
        ),
      ).toBe(true);
    });
  });
});
