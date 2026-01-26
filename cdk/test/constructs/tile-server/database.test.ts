/*
 * Copyright 2024-2026 Amazon.com, Inc. or its affiliates.
 */

import { App, Aspects, RemovalPolicy, Stack } from "aws-cdk-lib";
import { Annotations, Match, Template } from "aws-cdk-lib/assertions";
import { AwsSolutionsChecks } from "cdk-nag";

import { DatabaseTables } from "../../../lib/constructs/tile-server/database";
import { DataplaneConfig } from "../../../lib/constructs/tile-server/dataplane";
import {
  testAccount,
  testAdcAccount,
  testProdAccount
} from "../../test-account";
import { generateNagReport } from "../../test-utils";

describe("DatabaseTables", () => {
  let app: App;
  let stack: Stack;
  let config: DataplaneConfig;

  beforeEach(() => {
    app = new App();
    stack = new Stack(app, "TestStack", {
      env: { account: testAccount.id, region: testAccount.region }
    });
    config = new DataplaneConfig();
  });

  describe("constructor", () => {
    it("creates database tables with default configuration", () => {
      const databaseTables = new DatabaseTables(stack, "TestDatabaseTables", {
        account: testAccount,
        config: config,
        removalPolicy: RemovalPolicy.DESTROY
      });

      expect(databaseTables.jobTable).toBeDefined();
    });

    it("creates database tables with custom configuration", () => {
      const customConfig = new DataplaneConfig({
        DDB_JOB_TABLE: "CustomJobTable",
        DDB_TTL_ATTRIBUTE: "custom_ttl"
      });

      const databaseTables = new DatabaseTables(stack, "TestDatabaseTables", {
        account: testAccount,
        config: customConfig,
        removalPolicy: RemovalPolicy.DESTROY
      });

      expect(databaseTables.jobTable).toBeDefined();
    });
  });

  describe("job table creation", () => {
    it("creates DynamoDB table with correct properties", () => {
      new DatabaseTables(stack, "TestDatabaseTables", {
        account: testAccount,
        config: config,
        removalPolicy: RemovalPolicy.DESTROY
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::DynamoDB::Table", {
        TableName: "TSJobTable",
        KeySchema: [
          {
            AttributeName: "viewpoint_id",
            KeyType: "HASH"
          }
        ],
        AttributeDefinitions: [
          {
            AttributeName: "viewpoint_id",
            AttributeType: "S"
          },
          {
            AttributeName: "expire_time",
            AttributeType: "N"
          }
        ],
        BillingMode: "PAY_PER_REQUEST",
        PointInTimeRecoverySpecification: {
          PointInTimeRecoveryEnabled: true
        }
      });
    });

    it("creates table with custom name and TTL attribute", () => {
      const customConfig = new DataplaneConfig({
        DDB_JOB_TABLE: "CustomJobTable",
        DDB_TTL_ATTRIBUTE: "custom_expire_time"
      });

      new DatabaseTables(stack, "TestDatabaseTables", {
        account: testAccount,
        config: customConfig,
        removalPolicy: RemovalPolicy.DESTROY
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::DynamoDB::Table", {
        TableName: "CustomJobTable",
        AttributeDefinitions: [
          {
            AttributeName: "viewpoint_id",
            AttributeType: "S"
          },
          {
            AttributeName: "custom_expire_time",
            AttributeType: "N"
          }
        ]
      });
    });

    it("creates global secondary index for TTL attribute", () => {
      new DatabaseTables(stack, "TestDatabaseTables", {
        account: testAccount,
        config: config,
        removalPolicy: RemovalPolicy.DESTROY
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::DynamoDB::Table", {
        GlobalSecondaryIndexes: [
          {
            IndexName: "ttl-gsi",
            KeySchema: [
              {
                AttributeName: "expire_time",
                KeyType: "HASH"
              }
            ],
            Projection: {
              ProjectionType: "ALL"
            }
          }
        ]
      });
    });

    it("applies correct removal policy", () => {
      new DatabaseTables(stack, "TestDatabaseTables", {
        account: testAccount,
        config: config,
        removalPolicy: RemovalPolicy.RETAIN
      });

      const template = Template.fromStack(stack);

      template.hasResource("AWS::DynamoDB::Table", {
        DeletionPolicy: "Retain"
      });
    });

    it("enables AWS managed encryption", () => {
      new DatabaseTables(stack, "TestDatabaseTables", {
        account: testAccount,
        config: config,
        removalPolicy: RemovalPolicy.DESTROY
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::DynamoDB::Table", {
        SSESpecification: {
          SSEEnabled: true
        }
      });
    });
  });

  describe("backup configuration", () => {
    it("creates backup resources for production accounts", () => {
      new DatabaseTables(stack, "TestDatabaseTables", {
        account: testProdAccount,
        config: config,
        removalPolicy: RemovalPolicy.RETAIN
      });

      const template = Template.fromStack(stack);

      // Should create backup vault
      template.hasResourceProperties("AWS::Backup::BackupVault", {
        BackupVaultName: "TSBackupVault"
      });

      // Should create backup plan
      template.hasResource("AWS::Backup::BackupPlan", {});

      // Should create backup selection
      template.hasResource("AWS::Backup::BackupSelection", {});
    });

    it("does not create backup resources for non-production accounts", () => {
      new DatabaseTables(stack, "TestDatabaseTables", {
        account: testAccount,
        config: config,
        removalPolicy: RemovalPolicy.DESTROY
      });

      const template = Template.fromStack(stack);

      // Should not create backup resources
      template.resourceCountIs("AWS::Backup::BackupVault", 0);
      template.resourceCountIs("AWS::Backup::BackupPlan", 0);
      template.resourceCountIs("AWS::Backup::BackupSelection", 0);
    });

    it("does not create backup resources for ADC accounts", () => {
      new DatabaseTables(stack, "TestDatabaseTables", {
        account: testAdcAccount,
        config: config,
        removalPolicy: RemovalPolicy.RETAIN
      });

      const template = Template.fromStack(stack);

      // Should not create backup resources
      template.resourceCountIs("AWS::Backup::BackupVault", 0);
      template.resourceCountIs("AWS::Backup::BackupPlan", 0);
      template.resourceCountIs("AWS::Backup::BackupSelection", 0);
    });

    it("configures backup plans with correct rules", () => {
      new DatabaseTables(stack, "TestDatabaseTables", {
        account: testProdAccount,
        config: config,
        removalPolicy: RemovalPolicy.RETAIN
      });

      const template = Template.fromStack(stack);

      // Should have backup plan with weekly and monthly rules
      template.hasResourceProperties("AWS::Backup::BackupPlan", {
        BackupPlan: {
          BackupPlanRule: [
            // Weekly backup rule
            {
              RuleName: "Weekly",
              ScheduleExpression: "cron(0 5 ? * SAT *)"
            },
            // Monthly 5-year retention rule
            {
              RuleName: "Monthly5Year",
              ScheduleExpression: "cron(0 5 1 * ? *)",
              Lifecycle: {
                DeleteAfterDays: 1825 // 5 years
              }
            }
          ]
        }
      });
    });
  });

  describe("integration scenarios", () => {
    it("handles multiple database tables instances", () => {
      new DatabaseTables(stack, "TestDatabaseTables1", {
        account: testAccount,
        config: config,
        removalPolicy: RemovalPolicy.DESTROY
      });

      const customConfig = new DataplaneConfig({
        DDB_JOB_TABLE: "SecondJobTable"
      });

      new DatabaseTables(stack, "TestDatabaseTables2", {
        account: testAccount,
        config: customConfig,
        removalPolicy: RemovalPolicy.DESTROY
      });

      const template = Template.fromStack(stack);

      // Should create two tables
      template.resourceCountIs("AWS::DynamoDB::Table", 2);

      // Should have both table names
      template.hasResourceProperties("AWS::DynamoDB::Table", {
        TableName: "TSJobTable"
      });

      template.hasResourceProperties("AWS::DynamoDB::Table", {
        TableName: "SecondJobTable"
      });
    });

    it("creates table with all security features enabled", () => {
      new DatabaseTables(stack, "TestDatabaseTables", {
        account: testProdAccount,
        config: config,
        removalPolicy: RemovalPolicy.RETAIN
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::DynamoDB::Table", {
        // Point-in-time recovery enabled
        PointInTimeRecoverySpecification: {
          PointInTimeRecoveryEnabled: true
        },
        // Encryption enabled
        SSESpecification: {
          SSEEnabled: true
        }
      });

      // Should have RETAIN deletion policy
      template.hasResource("AWS::DynamoDB::Table", {
        DeletionPolicy: "Retain"
      });

      // Backup resources should exist
      template.resourceCountIs("AWS::Backup::BackupVault", 1);
      template.resourceCountIs("AWS::Backup::BackupPlan", 1);
      template.resourceCountIs("AWS::Backup::BackupSelection", 1);
    });
  });

  describe("error cases", () => {
    it("handles undefined removal policy gracefully", () => {
      expect(() => {
        new DatabaseTables(stack, "TestDatabaseTables", {
          account: testAccount,
          config: config,
          removalPolicy: undefined!
        });
      }).not.toThrow();

      const template = Template.fromStack(stack);

      // Should default to DESTROY when removal policy is undefined
      template.hasResource("AWS::DynamoDB::Table", {
        DeletionPolicy: "Delete"
      });
    });
  });
});

describe("cdk-nag Compliance Checks - DatabaseTables", () => {
  let app: App;
  let stack: Stack;

  beforeAll(() => {
    app = new App();
    stack = new Stack(app, "TestStack", {
      env: { account: testAccount.id, region: testAccount.region }
    });

    const config = new DataplaneConfig();
    new DatabaseTables(stack, "TestDatabaseTables", {
      account: testAccount,
      config: config,
      removalPolicy: RemovalPolicy.DESTROY
    });

    // Add the cdk-nag AwsSolutions Pack with extra verbose logging enabled.
    Aspects.of(stack).add(new AwsSolutionsChecks({ verbose: true }));

    const errors = Annotations.fromStack(stack).findError(
      "*",
      Match.stringLikeRegexp("AwsSolutions-.*")
    );
    const warnings = Annotations.fromStack(stack).findWarning(
      "*",
      Match.stringLikeRegexp("AwsSolutions-.*")
    );

    generateNagReport(stack, errors, warnings);
  });

  test("No unsuppressed Warnings", () => {
    const warnings = Annotations.fromStack(stack).findWarning(
      "*",
      Match.stringLikeRegexp("AwsSolutions-.*")
    );
    expect(warnings).toHaveLength(0);
  });

  test("No unsuppressed Errors", () => {
    const errors = Annotations.fromStack(stack).findError(
      "*",
      Match.stringLikeRegexp("AwsSolutions-.*")
    );
    expect(errors).toHaveLength(0);
  });
});
