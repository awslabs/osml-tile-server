/*
 * Copyright 2025 Amazon.com, Inc. or its affiliates.
 */

/**
 * @file TestImageryStack for deploying test imagery resources.
 *
 * This stack deploys the TestImagery construct which includes:
 * - S3 bucket for storing test imagery
 * - Deployment of test images from local assets
 */

import { Stack, StackProps } from "aws-cdk-lib";
import { ISecurityGroup, IVpc } from "aws-cdk-lib/aws-ec2";
import { IRole } from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

import { DeploymentConfig } from "../bin/deployment/load-deployment";
import { TestImagery } from "./constructs/test/imagery";
import { LambdaRole } from "./constructs/test/lambda-roles";
import { Test } from "./constructs/test/test";

/**
 * Properties for the TestImageryStack.
 */
export interface TestStackProps extends StackProps {
  /** The deployment configuration. */
  deployment: DeploymentConfig;
  /** The VPC to use for the test imagery. */
  vpc: IVpc;
  /** The tile server service endpoint DNS name (from Dataplane stack export). */
  serviceEndpointDnsName: string;
  /** Optional existing Lambda role to use. */
  existingLambdaRole?: IRole;
  /** Optional security group to use. */
  securityGroup?: ISecurityGroup;
}

/**
 * Stack for deploying test resources.
 */
export class TestStack extends Stack {
  /** The test imagery construct. */
  public readonly testImagery: TestImagery;

  public readonly role: LambdaRole;

  public readonly test: Test;

  private deployment: DeploymentConfig;

  /**
   * Creates a new TestImageryStack.
   *
   * @param scope - The scope in which to define this construct
   * @param id - The construct ID
   * @param props - The stack properties
   */
  constructor(scope: Construct, id: string, props: TestStackProps) {
    super(scope, id, props);

    this.deployment = props.deployment;

    // Create the test imagery construct
    this.testImagery = new TestImagery(this, "TestImagery", {
      account: {
        id: props.deployment.account.id,
        region: props.deployment.account.region,
        prodLike: props.deployment.account.prodLike,
        isAdc: props.deployment.account.isAdc,
      },
      vpc: props.vpc,
      config: this.deployment.testImageryConfig,
    });

    this.role = new LambdaRole(this, "TSLambdaRole", {
      account: props.deployment.account,
      roleName: "TSLambdaRole",
      existingLambdaRole: props.existingLambdaRole,
    });

    this.test = new Test(this, "TSIntegTest", {
      account: props.deployment.account,
      vpc: props.vpc,
      lambdaRole: this.role.lambdaRole,
      securityGroup: props.securityGroup,
      serviceEndpointDnsName: props.serviceEndpointDnsName,
      config: this.deployment.testConfig,
    });
  }
}
