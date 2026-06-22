import type {
  IsoDateTimeString,
  SourceApp,
  SourceType,
  VaultRelativePath
} from "../schemas";

export type RawContentType = "markdown" | "txt" | "json";

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
  listCandidates(input: SourceConnectorListInput): Promise<SourceCandidate[]>;
  read(input: SourceConnectorReadInput): Promise<RawSourceDocument>;
}
