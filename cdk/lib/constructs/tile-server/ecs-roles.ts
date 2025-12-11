/*
 * Copyright 2023-2025 Amazon.com, Inc. or its affiliates.
 */

import { region_info } from "aws-cdk-lib";
import {
  AccountPrincipal,
  CompositePrincipal,
  Effect,
  IRole,
  ManagedPolicy,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";

import { OSMLAccount } from "../types";

/**
 * Properties for creating ECS roles.
 */
export interface ECSRolesProps {
  /** The OSML account configuration. */
  readonly account: OSMLAccount;
  /** The name for the task role. */
  readonly taskRoleName: string;
  /** The name for the execution role. */
  readonly executionRoleName: string;
  /** Optional existing task role to use instead of creating one. */
  readonly existingTaskRole?: IRole;
  /** Optional existing execution role to use instead of creating one. */
  readonly existingExecutionRole?: IRole;
}

/**
 * Construct that manages both ECS task and execution roles.
 *
 * This construct encapsulates the creation and configuration of both the ECS
 * task role and execution role, providing a unified interface for
 * role management.
 */
export class ECSRoles extends Construct {
  /** The ECS task role. */
  public readonly taskRole: IRole;

  /** The ECS execution role. */
  public readonly executionRole: IRole;

  /** The AWS partition in which the roles will operate. */
  public readonly partition: string;

  /**
   * Creates a new ECSRoles construct.
   *
   * @param scope - The scope/stack in which to define this construct
   * @param id - The id of this construct within the current scope
   * @param props - The properties for configuring this construct
   */
  constructor(scope: Construct, id: string, props: ECSRolesProps) {
    super(scope, id);

    this.partition = region_info.Fact.find(
      props.account.region,
      region_info.FactName.PARTITION,
    )!;

    // Create or use existing task role
    this.taskRole = props.existingTaskRole || this.createTaskRole(props);

    // Create or use existing execution role
    this.executionRole =
      props.existingExecutionRole || this.createExecutionRole(props);
  }

  /**
   * Creates the ECS task role.
   *
   * @param props - The ECS roles properties
   * @returns The created task role
   */
  private createTaskRole(props: ECSRolesProps): IRole {
    const taskRole = new Role(this, "TileServerEcsTaskRole", {
      roleName: props.taskRoleName,
      assumedBy: new CompositePrincipal(
        new ServicePrincipal("ecs-tasks.amazonaws.com"),
        new ServicePrincipal("lambda.amazonaws.com"),
      ),
      description: "Allows access necessary AWS services (SQS, DynamoDB, ...)",
    });

    taskRole.assumeRolePolicy?.addStatements(
      new PolicyStatement({
        actions: ["sts:AssumeRole"],
        principals: [new AccountPrincipal(props.account.id)],
      }),
    );

    const taskPolicy = new ManagedPolicy(this, "TileServerEcsTaskPolicy", {
      managedPolicyName: "TileServerEcsTaskPolicy",
    });

    // Add permissions to assume roles for cross-account S3 access
    const stsPolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["sts:AssumeRole"],
      resources: ["*"],
    });

    // S3 permissions - wildcard needed for user-provided imagery buckets
    const s3PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        "s3:GetBucketAcl",
        "s3:ListBucket",
        "s3:GetBucketLocation",
        "s3:GetObject",
        "s3:GetObjectAcl",
        "s3:PutObject",
      ],
      resources: [`arn:${this.partition}:s3:::*`],
    });

    // KMS permissions - wildcard needed for encrypted S3 objects with various keys
    const kmsPolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["kms:Decrypt", "kms:GenerateDataKey", "kms:Encrypt"],
      resources: [
        `arn:${this.partition}:kms:${props.account.region}:${props.account.id}:key/*`,
      ],
    });

    // CloudWatch DescribeAlarms for autoscaling - account-level operation
    const autoScalingCwPolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["cloudwatch:DescribeAlarms"],
      resources: [`*`],
    });

    taskPolicy.addStatements(
      stsPolicyStatement,
      s3PolicyStatement,
      kmsPolicyStatement,
      autoScalingCwPolicyStatement,
    );

    taskRole.addManagedPolicy(taskPolicy);

    // Add NAG suppressions for necessary wildcard permissions
    NagSuppressions.addResourceSuppressions(
      taskPolicy,
      [
        {
          id: "AwsSolutions-IAM5",
          reason:
            "Wildcard permissions required: (1) S3 access to user-provided imagery buckets with arbitrary names, (2) KMS decryption for S3 objects encrypted with various customer-managed keys, (3) STS AssumeRole for cross-account S3 access patterns, (4) CloudWatch DescribeAlarms is an account-level operation for autoscaling",
          appliesTo: [
            "Resource::*",
            `Resource::arn:${this.partition}:s3:::*`,
            `Resource::arn:${this.partition}:kms:${props.account.region}:${props.account.id}:key/*`,
          ],
        },
      ],
      true,
    );

    return taskRole;
  }

  /**
   * Creates the ECS execution role.
   *
   * @param props - The ECS roles properties
   * @returns The created execution role
   */
  private createExecutionRole(props: ECSRolesProps): IRole {
    const executionRole = new Role(this, "TileServerExecutionRole", {
      roleName: props.executionRoleName,
      assumedBy: new CompositePrincipal(
        new ServicePrincipal("ecs-tasks.amazonaws.com"),
      ),
      description:
        "Allows the Oversight Tile Server to access necessary AWS services to boot up the ECS task...",
    });

    const tsPolicy = new ManagedPolicy(this, "TileServerExecutionPolicy", {
      managedPolicyName: "TileServerExecutionPolicy",
    });

    // ECR GetAuthorizationToken - account-level operation, requires wildcard
    const ecrAuthPolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["ecr:GetAuthorizationToken"],
      resources: ["*"],
    });

    // ECR repository access - wildcard needed for various container registries
    const ecrPolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:DescribeRepositories",
      ],
      resources: [
        `arn:${this.partition}:ecr:${props.account.region}:${props.account.id}:repository/*`,
      ],
    });

    tsPolicy.addStatements(ecrAuthPolicyStatement, ecrPolicyStatement);

    executionRole.addManagedPolicy(tsPolicy);

    // Add NAG suppressions for necessary wildcard permissions
    NagSuppressions.addResourceSuppressions(
      tsPolicy,
      [
        {
          id: "AwsSolutions-IAM5",
          reason:
            "Wildcard permissions required: (1) ECR GetAuthorizationToken is an account-level operation, (2) ECR repository access needed for pulling images from various repositories",
          appliesTo: [
            "Resource::*",
            `Resource::arn:${this.partition}:ecr:${props.account.region}:${props.account.id}:repository/*`,
          ],
        },
      ],
      true,
    );

    return executionRole;
  }
}
