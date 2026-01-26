/*
 * Copyright 2023-2026 Amazon.com, Inc. or its affiliates.
 */

import { App, CfnOutput, Environment, Stack, StackProps } from "aws-cdk-lib";
import { ISecurityGroup, IVpc } from "aws-cdk-lib/aws-ec2";

import { DeploymentConfig } from "../bin/deployment/load-deployment";
import { Dataplane, DataplaneConfig } from "./constructs/tile-server/dataplane";

export interface TileServerStackProps extends StackProps {
  readonly env: Environment;
  readonly deployment: DeploymentConfig;
  readonly vpc: IVpc; // VPC is now required and provided by NetworkStack
  readonly securityGroup?: ISecurityGroup; // Security group from NetworkStack
}

export class TileServerStack extends Stack {
  public resources: Dataplane;
  public vpc: IVpc;
  public readonly loadBalancerDnsName: string;
  private deployment: DeploymentConfig;

  /**
   * Constructor for the tile server dataplane cdk stack
   * @param parent the parent cdk app object
   * @param name the name of the stack to be created in the parent app object.
   * @param props the properties required to create the stack.
   * @returns the created TileServerStack object
   */
  constructor(parent: App, name: string, props: TileServerStackProps) {
    super(parent, name, {
      terminationProtection: props.deployment.account.prodLike,
      ...props
    });

    // Store deployment config for use in other methods
    this.deployment = props.deployment;

    // Use the provided VPC from NetworkStack
    this.vpc = props.vpc;

    // Create the tile server application dataplane using the VPC
    const dataplaneConfig = props.deployment.dataplaneConfig
      ? new DataplaneConfig(props.deployment.dataplaneConfig)
      : undefined;
    this.resources = new Dataplane(this, "Dataplane", {
      account: this.deployment.account,
      vpc: this.vpc,
      securityGroup: props.securityGroup,
      config: dataplaneConfig
    });

    // Expose the load balancer DNS name for cross-stack references
    this.loadBalancerDnsName =
      this.resources.ecsService.fargateService.loadBalancer.loadBalancerDnsName;

    // Add CloudFormation output for the load balancer DNS name
    new CfnOutput(this, "LoadBalancerDNS", {
      value: this.loadBalancerDnsName,
      description: "DNS name of the Tile Server Application Load Balancer",
      exportName: `${this.deployment.projectName}-LoadBalancerDNS`
    });
  }
}
