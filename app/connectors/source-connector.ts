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
  import_root: VaultRelativePath;
  since?: IsoDateTimeString;
}

export interface SourceConnector {
  readonly source_app: SourceApp;
  readonly supported_source_types: SourceType[];
  listCandidates(input: SourceConnectorListInput): Promise<SourceCandidate[]>;
  read(candidate: SourceCandidate): Promise<RawSourceDocument>;
}
