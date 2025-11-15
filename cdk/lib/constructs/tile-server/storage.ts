/*
 * Copyright 2025 Amazon.com, Inc. or its affiliates.
 */

import { RemovalPolicy } from "aws-cdk-lib";
import { ISecurityGroup, IVpc, SubnetType } from "aws-cdk-lib/aws-ec2";
import {
  AccessPoint,
  FileSystem,
  LifecyclePolicy,
  PerformanceMode,
  ThroughputMode,
} from "aws-cdk-lib/aws-efs";
import { AnyPrincipal, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

import { OSMLAccount } from "../types";
import { DataplaneConfig } from "./dataplane";

export interface StorageProps {
  /** The OSML account configuration. */
  readonly account: OSMLAccount;
  /** The VPC configuration. */
  readonly vpc: IVpc;
  /** The MR dataplane configuration. */
  readonly config: DataplaneConfig;
  /** The removal policy for resources. */
  readonly removalPolicy: RemovalPolicy;
  /** The security group for EFS. */
  readonly securityGroup?: ISecurityGroup;
}

export class Storage extends Construct {
  /**
   * The EFS file system for the TSDataplane.
   */
  public fileSystem: FileSystem;

  /**
   * The EFS access point for the TSDataplane.
   */
  public accessPoint: AccessPoint;

  constructor(scope: Construct, id: string, props: StorageProps) {
    super(scope, id);

    this.fileSystem = this.createFileSystem(props);

    this.accessPoint = this.createAccessPoint(props);
  }

  private createFileSystem(props: StorageProps) {
    // EFS volume mounted file system
    const fileSystem = new FileSystem(this, "TSEfsFileSystem", {
      vpc: props.vpc,
      lifecyclePolicy: LifecyclePolicy.AFTER_14_DAYS,
      performanceMode: PerformanceMode.GENERAL_PURPOSE,
      throughputMode: ThroughputMode.BURSTING,
      removalPolicy: props.removalPolicy,
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroup: props.securityGroup,
    });

    fileSystem.addToResourcePolicy(
      new PolicyStatement({
        actions: [
          "elasticfilesystem:ClientMount",
          "elasticfilesystem:ClientWrite",
          "elasticfilesystem:ClientRootAccess",
        ],
        principals: [new AnyPrincipal()],
        conditions: {
          Bool: {
            "elasticfilesystem:AccessedViaMountTarget": "true",
          },
        },
      }),
    );

    return fileSystem;
  }

  private createAccessPoint(props: StorageProps) {
    return this.fileSystem.addAccessPoint("TSAccessPoint", {
      path: "/" + props.config.EFS_MOUNT_NAME,
      createAcl: {
        ownerGid: "1000",
        ownerUid: "1000",
        permissions: "777",
      },
      posixUser: {
        uid: "1000",
        gid: "1000",
      },
    });
  }
}
