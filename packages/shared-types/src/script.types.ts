export interface ScriptSection {
  sectionId: string;
  heading: string;
  narration: string;
  estimatedDuration: number;
  keyMessage?: string;
  visualSuggestion?: string;
  order: number;
}

export interface Script {
  id: string;
  workspaceId: string;
  projectId: string;
  version: number;
  title: string;
  language: string;
  tone: string;
  targetAudience: string;
  sections: ScriptSection[];
  totalWordCount: number;
  estimatedDuration: number;
  status: 'draft' | 'approved' | 'superseded';
  providerMetadata?: {
    providerId: string;
    model: string;
  };
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

