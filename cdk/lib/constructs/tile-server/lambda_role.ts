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
 * Represents the properties required to define a tile server lambda sweeper role.
 *
 * @interface TSLambdaRoleProps
 */
export interface TSLambdaRoleProps {
  /**
   * The OSML (OversightML) deployment account associated with this role.
   *
   * @type {OSMLAccount}
   */
  account: OSMLAccount;

  /**
   * The name to give to the role.
   *
   * @type {string}
   */
  roleName: string;
}

/**
 * Represents an TSLambdaRole construct.
 */
export class TSLambdaRole extends Construct {
  /**
   * The AWS IAM role associated with this TSLambdaRole.
   */
  public role: IRole;

  /**
   * The AWS partition to be used for this TSLambdaRole.
   */
  public partition: string;

  /**
   * Creates an TSLambdaRole construct.
   * @param {Construct} scope - The scope/stack in which to define this construct.
   * @param {string} id - The id of this construct within the current scope.
   * @param {TSLambdaRoleProps} props - The properties of this construct.
   * @returns TSLambdaRole - The TSLambdaRole construct.
   */
  constructor(scope: Construct, id: string, props: TSLambdaRoleProps) {
    super(scope, id);

    // Determine the AWS partition based on the provided AWS region
    this.partition = region_info.Fact.find(
      props.account.region,
      region_info.FactName.PARTITION,
    )!;

    // Create an AWS IAM role for the Tile Server Lambda Sweeper Function
    const tsLambdaRole = new Role(this, "TSLambdaRole", {
      roleName: props.roleName,
      assumedBy: new CompositePrincipal(
        new ServicePrincipal("lambda.amazonaws.com"),
      ),
      description:
        "Allows the OversightML Tile Server Lambda Sweeper to access necessary AWS services (CW, SQS, DynamoDB, ...)",
    });

    const tsPolicy = new ManagedPolicy(this, "TSLambdaPolicy", {
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

    tsPolicy.addStatements(
      ddbPolicyStatement,
      lambdaPolicyStatement,
      ec2NetworkPolicyStatement,
      cwPolicyStatement,
    );

    tsLambdaRole.addManagedPolicy(tsPolicy);

    // Set the TSLambdaRole property to the created role
    this.role = tsLambdaRole;
  }
}
