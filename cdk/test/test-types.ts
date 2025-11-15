/*
 * Copyright 2024-2025 Amazon.com, Inc. or its affiliates.
 */

import { RemovalPolicy } from "aws-cdk-lib";

/**
 * Interface for CloudFormation resource properties
 */
export interface CloudFormationResource {
  Properties: Record<string, unknown>;
  Type: string;
  DeletionPolicy?: string;
  UpdateReplacePolicy?: string;
}

/**
 * Interface for IAM policy documents
 */
export interface IAMPolicyDocument {
  Statement: IAMPolicyStatement[];
  Version: string;
}

/**
 * Interface for IAM policy statements
 */
export interface IAMPolicyStatement {
  Effect: "Allow" | "Deny";
  Action: string | string[];
  Resource?: string | string[];
  Principal?: unknown;
  Condition?: Record<string, unknown>;
}

/**
 * Interface for IAM managed policy properties
 */
export interface IAMManagedPolicyProperties {
  ManagedPolicyName: string;
  PolicyDocument: IAMPolicyDocument;
  Roles?: Array<{ Ref: string }>;
  Path?: string;
  Description?: string;
}

/**
 * Interface for ECS environment variables
 */
export interface ECSEnvironmentVariable {
  Name: string;
  Value: string | { Ref: string } | { "Fn::GetAtt": [string, string] };
}

/**
 * Interface for ECS container definition properties
 */
export interface ECSContainerDefinition {
  Name: string;
  Image: string;
  Environment: ECSEnvironmentVariable[];
  LogConfiguration?: {
    LogDriver: string;
    Options: Record<string, string | { Ref: string }>;
  };
  HealthCheck?: {
    Command: string[];
    Interval: number;
    Retries: number;
    Timeout: number;
  };
  PortMappings?: Array<{
    ContainerPort: number;
    Protocol: string;
  }>;
  MountPoints?: Array<{
    SourceVolume: string;
    ContainerPath: string;
    ReadOnly: boolean;
  }>;
  Essential?: boolean;
  Cpu?: number;
  Memory?: number;
  StartTimeout?: number;
  StopTimeout?: number;
  DisableNetworking?: boolean;
}

/**
 * Interface for ECS task definition properties
 */
export interface ECSTaskDefinitionProperties {
  ContainerDefinitions: ECSContainerDefinition[];
  Cpu: string;
  Memory: string;
  TaskRoleArn?: { "Fn::GetAtt": [string, string] };
  ExecutionRoleArn?: { "Fn::GetAtt": [string, string] };
  Volumes?: Array<{
    Name: string;
    EfsVolumeConfiguration?: {
      FileSystemId: { Ref: string };
      TransitEncryption: string;
      AuthorizationConfig: {
        IAM: string;
        AccessPointId: { Ref: string };
      };
    };
  }>;
  NetworkMode?: string;
  RequiresCompatibilities?: string[];
  EphemeralStorage?: {
    SizeInGiB: number;
  };
  Family?: string;
}

/**
 * Interface for ECS service properties
 */
export interface ECSServiceProperties {
  LaunchType: string;
  NetworkConfiguration: {
    AwsvpcConfiguration: {
      AssignPublicIp: string;
      SecurityGroups: Array<{ "Fn::GetAtt": [string, string] }>;
      Subnets: Array<{ Ref: string }>;
    };
  };
  DeploymentConfiguration: {
    MinimumHealthyPercent: number;
  };
  Cluster?: { Ref: string };
  TaskDefinition?: { Ref: string };
}

/**
 * Interface for ALB properties
 */
export interface ALBProperties {
  SecurityGroups: Array<{ "Fn::GetAtt": [string, string] }>;
  Type: string;
  Scheme: string;
  Subnets?: Array<{ Ref: string }>;
}

/**
 * Type-safe undefined removal policy for testing
 */
export type TestRemovalPolicy = RemovalPolicy | undefined;
