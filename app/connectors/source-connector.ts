import type {
  IsoDateTimeString,
  SourceApp,
  SourceType,
  VaultRelativePath
} from "../schemas";

export type RawContentType = "markdown" | "txt" | "json";
export type SourceConnectorStatus = "available" | "reserved";

export interface SourceConnectorManifest {
  source_app: SourceApp;
  display_name: string;
  status: SourceConnectorStatus;
  default_enabled: boolean;
  supported_source_types: readonly SourceType[];
  supported_content_types: readonly RawContentType[];
  supported_extensions: readonly string[];
  import_path: VaultRelativePath;
  raw_source: string;
  permission_scope: string;
  reads: readonly string[];
  does_not_read: readonly string[];
  local_record_recognition: string;
  failure_help: string;
}

export interface SourceConnectorView extends SourceConnectorManifest {
  enabled: boolean;
}

export interface SourceCandidate {
  source_app: SourceApp;
  source_type: SourceType;
  raw_path: VaultRelativePath;
  raw_source: string;
  detected_at: IsoDateTimeString;
}

export interface RawSourceDocument extends SourceCandidate {
  content_type: RawContentType;
  content: string;
}

export interface SourceConnectorListInput {
  vault_root: string;
  import_root: VaultRelativePath;
  since?: IsoDateTimeString;
}

export interface SourceConnectorReadInput {
  vault_root: string;
  candidate: SourceCandidate;
}

export interface SourceConnector {
  readonly source_app: SourceApp;
  readonly supported_source_types: readonly SourceType[];
  readonly manifest: SourceConnectorManifest;
  listCandidates(input: SourceConnectorListInput): Promise<SourceCandidate[]>;
  read(input: SourceConnectorReadInput): Promise<RawSourceDocument>;
}
