/*
 * Copyright 2023-2025 Amazon.com, Inc. or its affiliates.
 */

import { Duration, RemovalPolicy } from "aws-cdk-lib";
import { AnyPrincipal, Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";

import { OSMLAccount } from "../types";
import { DataplaneConfig } from "./dataplane";

/**
 * Properties for creating messaging resources.
 */
export interface MessagingProps {
  /** The OSML account configuration. */
  readonly account: OSMLAccount;
  /** The dataplane configuration. */
  readonly config: DataplaneConfig;
}

/**
 * Construct that manages all SQS queues and SNS topics.
 *
 * This construct encapsulates the creation and configuration of all messaging
 * resources, including SQS queues for processing
 * requests and SNS topics for status notifications.
 */
export class Messaging extends Construct {
  /** The SQS queue for job processing requests. */
  public readonly jobQueue: Queue;

  /** The dead letter queue for job request queue. */
  public jobDlQueue: Queue;

  /**
   * Creates a new Messaging construct.
   *
   * @param scope - The scope/stack in which to define this construct
   * @param id - The id of this construct within the current scope
   * @param props - The properties for configuring this construct
   */
  constructor(scope: Construct, id: string, props: MessagingProps) {
    super(scope, id);

    // Create core processing queues
    this.jobQueue = this.createJobQueue(props);
  }

  /**
   * Creates the image request queue.
   *
   * @param props - The messaging properties
   * @returns The created Queue
   */
  private createJobQueue(props: MessagingProps): Queue {
    this.jobDlQueue = new Queue(this, "TSJobQueueDLQ", {
      queueName: `${props.config.SQS_JOB_QUEUE}-dlq`,
      retentionPeriod: Duration.days(14),
    });

    // Add policy to enforce SSL for DLQ
    this.jobDlQueue.addToResourcePolicy(
      new PolicyStatement({
        sid: "EnforceSSLRequestsOnly",
        effect: Effect.DENY,
        principals: [new AnyPrincipal()],
        actions: ["sqs:*"],
        resources: [this.jobDlQueue.queueArn],
        conditions: {
          Bool: {
            "aws:SecureTransport": "false",
          },
        },
      }),
    );

    const jobQueue = new Queue(this, "TSJobQueue", {
      queueName: props.config.SQS_JOB_QUEUE,
      visibilityTimeout: Duration.seconds(300),
      retentionPeriod: Duration.days(14),
      removalPolicy: RemovalPolicy.DESTROY,
      deadLetterQueue: {
        maxReceiveCount: 3,
        queue: this.jobDlQueue,
      },
    });

    // Add policy to enforce SSL for main queue
    jobQueue.addToResourcePolicy(
      new PolicyStatement({
        sid: "EnforceSSLRequestsOnly",
        effect: Effect.DENY,
        principals: [new AnyPrincipal()],
        actions: ["sqs:*"],
        resources: [jobQueue.queueArn],
        conditions: {
          Bool: {
            "aws:SecureTransport": "false",
          },
        },
      }),
    );

    return jobQueue;
  }
}
