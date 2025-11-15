/*
 * Copyright 2023-2025 Amazon.com, Inc. or its affiliates.
 */

import { region_info } from "aws-cdk-lib";
import {
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
 * Properties for creating Lambda role.
 */
export interface LambdaRoleProps {
  /** The OSML account configuration. */
  readonly account: OSMLAccount;
  /** The name for the lambda role. */
  readonly roleName: string;
  /** Optional existing lambda role to use instead of creating one. */
  readonly existingLambdaRole?: IRole;
}

/**
 * Construct that manages lambda roles.
 *
 * This construct encapsulates the creation and configuration the lambda role.
 */
export class LambdaRole extends Construct {
  /** The lambda role. */
  public readonly lambdaRole: IRole;

  /** The AWS partition in which the roles will operate. */
  public readonly partition: string;

  /**
   * Creates a new LambdaRoles construct.
   *
   * @param scope - The scope/stack in which to define this construct
   * @param id - The id of this construct within the current scope
   * @param props - The properties for configuring this construct
   */
  constructor(scope: Construct, id: string, props: LambdaRoleProps) {
    super(scope, id);

    this.partition = region_info.Fact.find(
      props.account.region,
      region_info.FactName.PARTITION,
    )!;

    // Create or use existing lambda role
    this.lambdaRole = props.existingLambdaRole || this.createLambdaRole(props);
  }

  /**
   * Creates the lambda role.
   *
   * @param props - The lambda roles properties
   * @returns The created lambda role
   */
  private createLambdaRole(props: LambdaRoleProps): IRole {
    const lambdaRole = new Role(this, "TSLambdaRole", {
      roleName: props.roleName,
      assumedBy: new CompositePrincipal(
        new ServicePrincipal("lambda.amazonaws.com"),
      ),
      description:
        "Allows the OversightML Tile Server Integration Test lambda to access necessary AWS services (CW, SQS, DynamoDB, ...)",
    });

    const policy = new ManagedPolicy(this, "TSLambdaPolicy", {
      managedPolicyName: "TSLambdaPolicy",
    });

    // Add permissions for AWS DynamoDb Service (DDB)
    const ddbPolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem"],
      resources: [
        `arn:${this.partition}:dynamodb:${props.account.region}:${props.account.id}:*`,
      ],
    });

    // Add permissions for the Lambda to have access to EC2 VPCs / Subnets / ELB
    const lambdaPolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["lambda:GetFunctionConfiguration"],
      resources: [
        `arn:${this.partition}:lambda:${props.account.region}:${props.account.id}:function:*`,
      ],
    });

    // Add permissions for the Lambda to have access to EC2 VPCs / Subnets / ELB
    const ec2NetworkPolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        "elasticloadbalancing:DescribeLoadBalancers",
        "ec2:CreateNetworkInterface",
        "ec2:DescribeNetworkInterfaces",
        "ec2:DeleteNetworkInterface",
        "ec2:DescribeInstances",
        "ec2:AttachNetworkInterface",
      ],
      resources: ["*"],
    });

    // Add permissions for AWS Cloudwatch Event (DDB)
    const cwPolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
      ],
      resources: [
        `arn:${this.partition}:logs:${props.account.region}:${props.account.id}:*`,
      ],
    });

    policy.addStatements(
      ddbPolicyStatement,
      lambdaPolicyStatement,
      ec2NetworkPolicyStatement,
      cwPolicyStatement,
    );

    lambdaRole.addManagedPolicy(policy);

    return lambdaRole;
  }
}
