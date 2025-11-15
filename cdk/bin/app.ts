#!/usr/bin/env node

/*
 * Copyright 2025 Amazon.com, Inc. or its affiliates.
 */

/**
 * @file Entry point for the OSML TileServer CDK application.
 *
 * This file bootstraps the CDK app, loads deployment configuration,
 * and instantiates the OSMLTileServerStack with validated parameters.
 *
 */

import { App } from "aws-cdk-lib";
import { IVpc, Vpc } from "aws-cdk-lib/aws-ec2";

import { NetworkStack } from "../lib/network-stack";
import { TestStack } from "../lib/test-stack";
import { TileServerStack } from "../lib/tile-server-stack";
import { loadDeploymentConfig } from "./deployment/load-deployment";

// -----------------------------------------------------------------------------
// Initialize CDK Application
// -----------------------------------------------------------------------------

const app = new App();

/**
 * Load and validate deployment configuration from deployment.json.
 *
 * This includes:
 * - Project name
 * - AWS account ID and region
 * - Tile Server configuration
 */
const deployment = loadDeploymentConfig();

// -----------------------------------------------------------------------------
// Create VPC (only if importing existing VPC)
// -----------------------------------------------------------------------------

let vpc: IVpc | undefined;
if (deployment.networkConfig?.VPC_ID) {
  // Import existing VPC
  vpc = Vpc.fromLookup(app, "ImportedVPC", {
    vpcId: deployment.networkConfig.VPC_ID,
  });
}

// -----------------------------------------------------------------------------
// Deploy the network stack.
// -----------------------------------------------------------------------------

const networkStack = new NetworkStack(
  app,
  `${deployment.projectName}-TileServerNetwork`,
  {
    env: {
      account: deployment.account.id,
      region: deployment.account.region,
    },
    deployment: deployment,
    vpc: vpc,
  },
);

// -----------------------------------------------------------------------------
// Define and Deploy the OSMLTileServerStack
// -----------------------------------------------------------------------------

const tileServerStack = new TileServerStack(
  app,
  `${deployment.projectName}-TileServer`,
  {
    env: {
      account: deployment.account.id,
      region: deployment.account.region,
    },
    deployment: deployment,
    vpc: networkStack.network.vpc,
    securityGroup: networkStack.network.securityGroup,
    description:
      "TileServer, Guidance for Processing Overhead Imagery on AWS (SO9240)",
  },
);

tileServerStack.node.addDependency(networkStack);

// -----------------------------------------------------------------------------
// Deploy the TestStack (if integration tests enabled)
// -----------------------------------------------------------------------------

if (deployment.deployIntegrationTests) {
  const testStack = new TestStack(
    app,
    `${deployment.projectName}-TileServerTest`,
    {
      env: {
        account: deployment.account.id,
        region: deployment.account.region,
      },
      deployment: deployment,
      vpc: networkStack.network.vpc,
      fargateService: tileServerStack.resources.ecsService.fargateService,
    },
  );
  testStack.node.addDependency(tileServerStack);
}
