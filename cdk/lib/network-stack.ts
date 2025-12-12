/*
 * Copyright 2023-2025 Amazon.com, Inc. or its affiliates.
 */

/**
 * @file NetworkStack for deploying VPC and networking infrastructure.
 *
 * This stack deploys the Network construct which includes:
 * - VPC with public and private subnets
 * - Security groups
 * - VPC flow logs (for production environments)
 * - NAT Gateway for private subnet egress
 */

import { Stack, StackProps } from "aws-cdk-lib";
import { IVpc } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

import { DeploymentConfig } from "../bin/deployment/load-deployment";
import { Network, NetworkConfig } from "./constructs/tile-server/network";

/**
 * Properties for the NetworkStack.
 */
export interface NetworkStackProps extends StackProps {
  /** The deployment configuration. */
  deployment: DeploymentConfig;
  /** Optional existing VPC to import instead of creating a new one. */
  vpc?: IVpc;
}

/**
 * Stack for deploying networking infrastructure.
 */
export class NetworkStack extends Stack {
  /** The network construct containing VPC and security groups. */
  public readonly network: Network;

  /**
   * Creates a new NetworkStack.
   *
   * @param scope - The scope in which to define this construct
   * @param id - The construct ID
   * @param props - The stack properties
   */
  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    // Get the container port from dataplane config
    const containerPort =
      (props.deployment.dataplaneConfig?.ECS_CONTAINER_PORT as
        | number
        | undefined) || 8080;

    // Create Network construct using deployment configuration
    // The Network construct will handle VPC import or creation based on the config
    const networkConfig = props.deployment.networkConfig ?? new NetworkConfig();
    this.network = new Network(this, "Network", {
      account: props.deployment.account,
      config: networkConfig,
      containerPort: containerPort,
      vpc: props.vpc,
    });
  }
}
