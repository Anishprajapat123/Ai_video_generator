# PDF to video

Open Create Video, name the project, and select a file under **Or start from a PDF**. Import replaces the Video idea field with extracted text and grounding instructions. Review or edit that text, select a model and video preferences, then choose Generate script. The usual script approval, storyboard, generated visuals/narration, preview and MP4 export follow.

PDFs must contain selectable text, be unencrypted, and fit within 5 MB / 50 pages. Scanned pages need OCR, which is not included. Import takes the first 9,000 characters and explicitly warns if text was truncated. Reading PDF text itself makes no AI request. Text is included in the existing browser-tab draft and sent to the chosen model only when generating. The original PDF is not saved or sent to an AI service. New imported projects use the document creation type. PDF source text is not separately stored in the database; after successful generation the script is the saved result.

The authenticated `POST /api/v1/workspaces/:workspaceId/documents/extract` endpoint accepts an `application/pdf` binary body. Active editor access and CSRF are required. Extraction runs in an isolated process with a 256 MB JavaScript heap limit and a 15-second timeout, one concurrent parser per API process, with 20 imports per user per hour. It returns `{ text, pages, truncated }`. No document URLs are fetched, and embedded scripts are not evaluated.

This implementation follows the document-grounding idea from Awesome LLM Apps' local RAG example without adding its Python application, vector database or local language models. It does not provide retrieval across a document collection, exact citations, OCR or PowerPoint import.

Verification: `npm.cmd run typecheck`, `npm.cmd run build`, and `npm.cmd test`. Parser tests use synthetic PDFs; HTTP tests cover successful extraction, malformed input, CSRF, authentication and editor-only access. No paid model is called by these checks.
