/*
 * Copyright 2024-2026 Amazon.com, Inc. or its affiliates.
 */

import { App, Aspects, Stack } from "aws-cdk-lib";
import { Annotations, Match, Template } from "aws-cdk-lib/assertions";
import { AwsSolutionsChecks } from "cdk-nag";

import { DataplaneConfig } from "../../../lib/constructs/tile-server/dataplane";
import { Messaging } from "../../../lib/constructs/tile-server/messaging";
import { testAccount } from "../../test-account";
import { generateNagReport } from "../../test-utils";

describe("Messaging", () => {
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
    it("creates messaging resources with default configuration", () => {
      const messaging = new Messaging(stack, "TestMessaging", {
        account: testAccount,
        config: config
      });

      expect(messaging.jobQueue).toBeDefined();
      expect(messaging.jobDlQueue).toBeDefined();
    });

    it("creates messaging resources with custom configuration", () => {
      const customConfig = new DataplaneConfig({
        SQS_JOB_QUEUE: "CustomJobQueue"
      });

      const messaging = new Messaging(stack, "TestMessaging", {
        account: testAccount,
        config: customConfig
      });

      expect(messaging.jobQueue).toBeDefined();
      expect(messaging.jobDlQueue).toBeDefined();
    });
  });

  describe("job queue creation", () => {
    it("creates SQS queue with correct properties", () => {
      new Messaging(stack, "TestMessaging", {
        account: testAccount,
        config: config
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::SQS::Queue", {
        QueueName: "TSJobQueue",
        VisibilityTimeout: 300,
        MessageRetentionPeriod: 1209600 // 14 days in seconds
      });
    });

    it("creates queue with custom name", () => {
      const customConfig = new DataplaneConfig({
        SQS_JOB_QUEUE: "CustomJobQueue"
      });

      new Messaging(stack, "TestMessaging", {
        account: testAccount,
        config: customConfig
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::SQS::Queue", {
        QueueName: "CustomJobQueue"
      });
    });

    it("configures dead letter queue correctly", () => {
      new Messaging(stack, "TestMessaging", {
        account: testAccount,
        config: config
      });

      const template = Template.fromStack(stack);

      // Should create dead letter queue
      template.hasResourceProperties("AWS::SQS::Queue", {
        QueueName: "TSJobQueue-dlq",
        MessageRetentionPeriod: 1209600 // 14 days in seconds
      });

      // Main queue should have a redrive policy with maxReceiveCount
      template.hasResourceProperties("AWS::SQS::Queue", {
        QueueName: "TSJobQueue",
        RedrivePolicy: {
          maxReceiveCount: 3
        }
      });
    });

    it("sets correct visibility timeout", () => {
      new Messaging(stack, "TestMessaging", {
        account: testAccount,
        config: config
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::SQS::Queue", {
        QueueName: "TSJobQueue",
        VisibilityTimeout: 300 // 5 minutes
      });
    });

    it("sets correct message retention period", () => {
      new Messaging(stack, "TestMessaging", {
        account: testAccount,
        config: config
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::SQS::Queue", {
        QueueName: "TSJobQueue",
        MessageRetentionPeriod: 1209600 // 14 days
      });

      template.hasResourceProperties("AWS::SQS::Queue", {
        QueueName: "TSJobQueue-dlq",
        MessageRetentionPeriod: 1209600 // 14 days
      });
    });

    it("applies DESTROY removal policy by default", () => {
      new Messaging(stack, "TestMessaging", {
        account: testAccount,
        config: config
      });

      const template = Template.fromStack(stack);

      // SQS queues should have DESTROY policy by default
      template.hasResource("AWS::SQS::Queue", {
        DeletionPolicy: "Delete"
      });
    });
  });

  describe("queue integration", () => {
    it("creates correct dead letter queue relationship", () => {
      const messaging = new Messaging(stack, "TestMessaging", {
        account: testAccount,
        config: config
      });

      const template = Template.fromStack(stack);

      // Should create exactly 2 queues
      template.resourceCountIs("AWS::SQS::Queue", 2);

      // Main queue should have redrive policy with correct maxReceiveCount
      template.hasResourceProperties("AWS::SQS::Queue", {
        QueueName: "TSJobQueue",
        RedrivePolicy: {
          maxReceiveCount: 3
        }
      });

      // DLQ should not have a redrive policy
      template.hasResourceProperties("AWS::SQS::Queue", {
        QueueName: "TSJobQueue-dlq"
      });

      // Verify the messaging construct exposes both queues
      expect(messaging.jobQueue).toBeDefined();
      expect(messaging.jobDlQueue).toBeDefined();
    });

    it("handles multiple messaging instances", () => {
      new Messaging(stack, "TestMessaging1", {
        account: testAccount,
        config: config
      });

      const customConfig = new DataplaneConfig({
        SQS_JOB_QUEUE: "SecondJobQueue"
      });

      new Messaging(stack, "TestMessaging2", {
        account: testAccount,
        config: customConfig
      });

      const template = Template.fromStack(stack);

      // Should create 4 queues total (2 main + 2 DLQ)
      template.resourceCountIs("AWS::SQS::Queue", 4);

      // Should have both queue names
      template.hasResourceProperties("AWS::SQS::Queue", {
        QueueName: "TSJobQueue"
      });

      template.hasResourceProperties("AWS::SQS::Queue", {
        QueueName: "SecondJobQueue"
      });

      template.hasResourceProperties("AWS::SQS::Queue", {
        QueueName: "TSJobQueue-dlq"
      });

      template.hasResourceProperties("AWS::SQS::Queue", {
        QueueName: "SecondJobQueue-dlq"
      });
    });
  });

  describe("queue properties validation", () => {
    it("ensures DLQ has no redrive policy", () => {
      new Messaging(stack, "TestMessaging", {
        account: testAccount,
        config: config
      });

      const template = Template.fromStack(stack);

      // Find all SQS queues in the template
      const resources = template.findResources("AWS::SQS::Queue");

      let dlqResource: unknown = null;
      let mainQueueResource: unknown = null;

      // Identify which is DLQ and which is main queue
      Object.entries(resources).forEach(([, resource]) => {
        const resourceProps = resource as { Properties: { QueueName: string } };
        const props = resourceProps.Properties;
        if (props.QueueName === "TSJobQueue-dlq") {
          dlqResource = props;
        } else if (props.QueueName === "TSJobQueue") {
          mainQueueResource = props;
        }
      });

      // Main queue should have redrive policy
      const mainQueueProps = mainQueueResource as {
        RedrivePolicy: { maxReceiveCount: number };
      };
      const dlqProps = dlqResource as { RedrivePolicy?: unknown };

      expect(mainQueueProps.RedrivePolicy).toBeDefined();
      expect(mainQueueProps.RedrivePolicy.maxReceiveCount).toBe(3);

      // DLQ should NOT have redrive policy
      expect(dlqProps.RedrivePolicy).toBeUndefined();
    });

    it("configures correct max receive count", () => {
      new Messaging(stack, "TestMessaging", {
        account: testAccount,
        config: config
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::SQS::Queue", {
        QueueName: "TSJobQueue",
        RedrivePolicy: {
          maxReceiveCount: 3
        }
      });
    });
  });

  describe("integration scenarios", () => {
    it("works correctly with different account types", () => {
      // Test that messaging works the same regardless of account type
      // (Unlike DatabaseTables, Messaging doesn't have prod-specific behavior)

      new Messaging(stack, "TestMessaging", {
        account: testAccount, // non-prod account
        config: config
      });

      const template = Template.fromStack(stack);

      // Should create the same resources regardless of account type
      template.resourceCountIs("AWS::SQS::Queue", 2);

      template.hasResourceProperties("AWS::SQS::Queue", {
        QueueName: "TSJobQueue",
        VisibilityTimeout: 300,
        MessageRetentionPeriod: 1209600
      });

      template.hasResourceProperties("AWS::SQS::Queue", {
        QueueName: "TSJobQueue-dlq",
        MessageRetentionPeriod: 1209600
      });
    });

    it("creates consistent queue naming pattern", () => {
      const customConfig = new DataplaneConfig({
        SQS_JOB_QUEUE: "MyCustomQueue"
      });

      new Messaging(stack, "TestMessaging", {
        account: testAccount,
        config: customConfig
      });

      const template = Template.fromStack(stack);

      // Main queue should use exact config name
      template.hasResourceProperties("AWS::SQS::Queue", {
        QueueName: "MyCustomQueue"
      });

      // DLQ should append "-dlq" to config name
      template.hasResourceProperties("AWS::SQS::Queue", {
        QueueName: "MyCustomQueue-dlq"
      });
    });
  });
});

describe("cdk-nag Compliance Checks - Messaging", () => {
  let app: App;
  let stack: Stack;

  beforeAll(() => {
    app = new App();
    stack = new Stack(app, "TestStack", {
      env: { account: testAccount.id, region: testAccount.region }
    });

    const config = new DataplaneConfig();
    new Messaging(stack, "TestMessaging", {
      account: testAccount,
      config: config
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
