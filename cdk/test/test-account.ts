/*
 * Copyright 2024-2025 Amazon.com, Inc. or its affiliates.
 */

import { OSMLAccount } from "../lib/constructs/types";

export const testAccount: OSMLAccount = {
  id: "123456789012",
  prodLike: false,
  region: "us-west-2",
  isAdc: false,
};

export const testProdAccount: OSMLAccount = {
  id: "123456789012",
  prodLike: true,
  region: "us-west-2",
  isAdc: false,
};

export const testAdcAccount: OSMLAccount = {
  id: "123456789012",
  prodLike: true,
  region: "us-isob-east-1",
  isAdc: true,
};
