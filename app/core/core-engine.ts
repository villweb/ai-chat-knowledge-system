import type { SourceConnector } from "../connectors";
import type { CredentialProvider } from "../services";
import type { StorageProvider } from "../storage";

export interface CoreEngineDependencies {
  storage: StorageProvider;
  connectors: SourceConnector[];
  credentials: CredentialProvider;
}

export interface CoreEngine {
  readonly dependencies: CoreEngineDependencies;
}
