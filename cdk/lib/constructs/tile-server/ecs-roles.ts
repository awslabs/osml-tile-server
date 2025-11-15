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

    // Add permissions to assume roles
    const stsPolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["sts:AssumeRole"],
      resources: ["*"],
    });

    // S3 permissions
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

    // Add permissions for AWS Key Management Service (KMS)
    const kmsPolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["kms:Decrypt", "kms:GenerateDataKey", "kms:Encrypt"],
      resources: [
        `arn:${this.partition}:kms:${props.account.region}:${props.account.id}:key/*`,
      ],
    });

    // Add permissions for SQS permissions
    const sqsPolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        "sqs:DeleteMessage",
        "sqs:ListQueues",
        "sqs:GetQueueUrl",
        "sqs:ReceiveMessage",
        "sqs:SendMessage",
        "sqs:GetQueueAttributes",
      ],
      resources: [
        `arn:${this.partition}:sqs:${props.account.region}:${props.account.id}:*`,
      ],
    });

    // Add permissions for dynamodb permissions
    const ddbPolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        "dynamodb:BatchGetItem",
        "dynamodb:BatchWriteItem",
        "dynamodb:PutItem",
        "dynamodb:ListTables",
        "dynamodb:DeleteItem",
        "dynamodb:GetItem",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:UpdateItem",
        "dynamodb:UpdateTable",
        "dynamodb:DescribeTable",
      ],
      resources: [
        `arn:${this.partition}:dynamodb:${props.account.region}:${props.account.id}:*`,
      ],
    });

    // Add permission for autoscaling ECS permissions
    const autoScalingEcsPolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["ecs:DescribeServices", "ecs:UpdateService"],
      resources: [
        `arn:${this.partition}:ecs:${props.account.region}:${props.account.id}:*`,
      ],
    });

    // Add permission for CW ECS permissions
    const cwPolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        "logs:PutLogEvents",
        "logs:GetLogEvents",
        "logs:DescribeLogStreams",
        "logs:DescribeLogGroups",
        "logs:CreateLogStream",
        "logs:CreateLogGroup",
      ],
      resources: [
        `arn:${this.partition}:logs:${props.account.region}:${props.account.id}:log-group:*`,
      ],
    });

    // Add permission for autoscaling CW permissions
    const autoScalingCwPolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["cloudwatch:DescribeAlarms"],
      resources: [`*`],
    });

    // Add permissions for AWS Events
    const eventsPolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["events:PutRule", "events:PutTargets", "events:DescribeRule"],
      resources: [
        `arn:${this.partition}:events:${props.account.region}:${props.account.id}:*`,
      ],
    });

    taskPolicy.addStatements(
      stsPolicyStatement,
      s3PolicyStatement,
      kmsPolicyStatement,
      sqsPolicyStatement,
      ddbPolicyStatement,
      autoScalingEcsPolicyStatement,
      autoScalingCwPolicyStatement,
      cwPolicyStatement,
      eventsPolicyStatement,
    );

    taskRole.addManagedPolicy(taskPolicy);

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

    // Add permissions for ECR permissions
    const ecrAuthPolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["ecr:GetAuthorizationToken"],
      resources: ["*"],
    });

    // Add permissions for ECR permissions
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

    // Add permissions for cloudwatch permissions
    const cwPolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        "logs:PutLogEvents",
        "logs:GetLogEvents",
        "logs:DescribeLogStreams",
        "logs:DescribeLogGroups",
        "logs:CreateLogStream",
        "logs:CreateLogGroup",
      ],
      resources: [
        `arn:${this.partition}:logs:${props.account.region}:${props.account.id}:*`,
      ],
    });

    tsPolicy.addStatements(
      ecrAuthPolicyStatement,
      ecrPolicyStatement,
      cwPolicyStatement,
    );

    executionRole.addManagedPolicy(tsPolicy);

    return executionRole;
  }
}
