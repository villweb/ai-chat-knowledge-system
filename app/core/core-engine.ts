import type { SourceConnector } from "../connectors";
import type { CredentialProvider } from "../services";
import type { StorageProvider } from "../storage";
import {
  runManualImportNormalization,
  type ManualImportNormalizationInput,
  type ManualImportNormalizationSummary
} from "./manual-import-normalization-runner";

export interface CoreEngineDependencies {
  storage: StorageProvider;
  connectors: SourceConnector[];
  credentials: CredentialProvider;
}

export interface CoreEngine {
  readonly dependencies: CoreEngineDependencies;
  runManualImportNormalization(input: ManualImportNormalizationInput): Promise<ManualImportNormalizationSummary>;
}

export class LocalCoreEngine implements CoreEngine {
  constructor(readonly dependencies: CoreEngineDependencies) {}

  async runManualImportNormalization(
    input: ManualImportNormalizationInput
  ): Promise<ManualImportNormalizationSummary> {
    return runManualImportNormalization(input);
  }
}
