/*
 * Copyright 2023-2025 Amazon.com, Inc. or its affiliates.
 */

import { App, Environment, Stack, StackProps } from "aws-cdk-lib";
import { ISecurityGroup, IVpc } from "aws-cdk-lib/aws-ec2";

import { DeploymentConfig } from "../bin/deployment/load-deployment";
import { Dataplane } from "./constructs/tile-server/dataplane";

export interface TileServerStackProps extends StackProps {
  readonly env: Environment;
  readonly deployment: DeploymentConfig;
  readonly vpc: IVpc;
  readonly securityGroup?: ISecurityGroup;
}

export class TileServerStack extends Stack {
  public resources: Dataplane;
  public vpc: IVpc;
  public securityGroup?: ISecurityGroup;
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
      ...props,
    });

    this.deployment = props.deployment;
    this.vpc = props.vpc;
    this.securityGroup = props.securityGroup;

    // Create the tile server application dataplane
    this.resources = new Dataplane(this, "TileServerDataplane", {
      account: this.deployment.account,
      vpc: this.vpc,
      securityGroup: this.securityGroup,
      config: this.deployment.dataplaneConfig,
    });
  }
}
