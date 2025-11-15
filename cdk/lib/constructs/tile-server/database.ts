/*
 * Copyright 2023-2025 Amazon.com, Inc. or its affiliates.
 */

import { RemovalPolicy } from "aws-cdk-lib";
import {
  BackupPlan,
  BackupPlanRule,
  BackupResource,
  BackupVault,
} from "aws-cdk-lib/aws-backup";
import {
  AttributeType,
  BillingMode,
  Table,
  TableEncryption,
} from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";

import { OSMLAccount } from "../types";
import { DataplaneConfig } from "./dataplane";

/**
 * Properties for creating database tables.
 */
export interface DatabaseTablesProps {
  /** The OSML account configuration. */
  readonly account: OSMLAccount;
  /** The dataplane configuration. */
  readonly config: DataplaneConfig;
  /** The removal policy for resources. */
  readonly removalPolicy: RemovalPolicy;
}

/**
 * Construct that manages DynamoDB tables and backup configuration.
 *
 * This construct encapsulates the creation and configuration of DynamoDB tables,
 * including backup policies for production environments.
 */
export class DatabaseTables extends Construct {
  /** The DynamoDB table to store worker status info */
  public readonly jobTable: Table;

  /**
   * Creates a new DatabaseTables construct.
   *
   * @param scope - The scope/stack in which to define this construct
   * @param id - The id of this construct within the current scope
   * @param props - The properties for configuring this construct
   */
  constructor(scope: Construct, id: string, props: DatabaseTablesProps) {
    super(scope, id);

    // Create DynamoDB tables
    this.jobTable = this.createJobTable(props);

    // Create backup configuration for production environments
    if (props.account.prodLike && !props.account.isAdc) {
      this.createBackupConfiguration();
    }
  }

  /**
   * Creates the job status table.
   *
   * @param props - The database tables properties
   * @returns The created Table
   */
  private createJobTable(props: DatabaseTablesProps): Table {
    const table = new Table(this, "TSJobTable", {
      tableName: props.config.DDB_JOB_TABLE,
      partitionKey: {
        name: "viewpoint_id",
        type: AttributeType.STRING,
      },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: props.removalPolicy || RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      encryption: TableEncryption.AWS_MANAGED,
    });

    // Add TTL attribute
    table.addGlobalSecondaryIndex({
      indexName: "ttl-gsi",
      partitionKey: {
        name: props.config.DDB_TTL_ATTRIBUTE,
        type: AttributeType.NUMBER,
      },
    });

    return table;
  }

  /**
   * Creates backup configuration for production environments.
   *
   * @param props - The database tables properties
   */
  private createBackupConfiguration(): void {
    const backupVault = new BackupVault(this, "TSBackupVault", {
      backupVaultName: "TSBackupVault",
    });

    const backupPlan = new BackupPlan(this, "TSBackupPlan");
    backupPlan.addRule(BackupPlanRule.weekly(backupVault));
    backupPlan.addRule(BackupPlanRule.monthly5Year(backupVault));

    backupPlan.addSelection("TSBackupSelection", {
      resources: [BackupResource.fromDynamoDbTable(this.jobTable)],
    });
  }
}
