import { readFile } from "node:fs/promises";
import path from "node:path";

type JsonEntry = {
  entryPath: string;
  parentPath: string | null;
  name: string;
  isDirectory: boolean;
  content: string | null;
  summary: string | null;
};

type JsonExport = {
  rootDir: string;
  generatedAt: string;
  model?: string;
  entries: JsonEntry[];
};

type TypesenseDocument = {
  id: string;
  entryPath: string;
  parentPath: string;
  name: string;
  isDirectory: boolean;
  content: string;
  summary: string;
  pathText: string;
  generatedAt: string;
};

const TYPESENSE_URL = process.env.TYPESENSE_URL ?? "http://localhost:8108";
const TYPESENSE_API_KEY = process.env.TYPESENSE_API_KEY ?? "xyz";
const COLLECTION_NAME = process.env.TYPESENSE_COLLECTION ?? "markdown_entries";

function getJsonPath(argv: string[]): string {
  return path.resolve(argv[2] ?? "./markdown-export.json");
}

async function loadExport(jsonPath: string): Promise<JsonExport> {
  const raw = await readFile(jsonPath, "utf8");
  const parsed = JSON.parse(raw) as JsonExport;

  if (!parsed || !Array.isArray(parsed.entries)) {
    throw new Error(`Invalid export file: ${jsonPath}`);
  }

  return parsed;
}

function createDocument(entry: JsonEntry, generatedAt: string): TypesenseDocument {
  return {
    id: entry.entryPath,
    entryPath: entry.entryPath,
    parentPath: entry.parentPath ?? "",
    name: entry.name,
    isDirectory: entry.isDirectory,
    content: entry.content ?? "",
    summary: entry.summary ?? "",
    pathText: [entry.parentPath, entry.entryPath, entry.name].filter(Boolean).join(" "),
    generatedAt,
  };
}

async function typesenseFetch(pathname: string, init?: RequestInit): Promise<Response> {
  return fetch(`${TYPESENSE_URL}${pathname}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-TYPESENSE-API-KEY": TYPESENSE_API_KEY,
      ...(init?.headers ?? {}),
    },
  });
}

async function ensureCollection(): Promise<void> {
  const schema = {
    name: COLLECTION_NAME,
    fields: [
      { name: "entryPath", type: "string" },
      { name: "parentPath", type: "string", optional: true },
      { name: "name", type: "string" },
      { name: "isDirectory", type: "bool" },
      { name: "content", type: "string", optional: true },
      { name: "summary", type: "string", optional: true },
      { name: "pathText", type: "string" },
      { name: "generatedAt", type: "string" },
    ],
    default_sorting_field: undefined,
  };

  const getResponse = await typesenseFetch(`/collections/${COLLECTION_NAME}`, {
    method: "GET",
  });

  if (getResponse.ok) {
    return;
  }

  if (getResponse.status !== 404) {
    const body = await getResponse.text();
    throw new Error(`Failed to inspect collection: ${getResponse.status} ${body}`);
  }

  const createResponse = await typesenseFetch("/collections", {
    method: "POST",
    body: JSON.stringify(schema),
  });

  if (!createResponse.ok) {
    const body = await createResponse.text();
    throw new Error(`Failed to create collection: ${createResponse.status} ${body}`);
  }
}

async function importDocuments(documents: TypesenseDocument[]): Promise<void> {
  const body = documents.map((document) => JSON.stringify(document)).join("\n");

  const response = await fetch(
    `${TYPESENSE_URL}/collections/${COLLECTION_NAME}/documents/import?action=upsert`,
    {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        "X-TYPESENSE-API-KEY": TYPESENSE_API_KEY,
      },
      body,
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Typesense import failed: ${response.status} ${errorText}`);
  }

  const resultText = await response.text();
  const failures = resultText
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { success: boolean; error?: string })
    .filter((line) => !line.success);

  if (failures.length > 0) {
    throw new Error(`Typesense import had ${failures.length} failed documents.`);
  }
}

async function main(): Promise<void> {
  const jsonPath = getJsonPath(process.argv);
  const exportData = await loadExport(jsonPath);
  const documents = exportData.entries.map((entry) =>
    createDocument(entry, exportData.generatedAt),
  );

  await ensureCollection();
  await importDocuments(documents);

  console.log(
    `Indexed ${documents.length} documents into ${COLLECTION_NAME} from ${jsonPath}`,
  );
}

main().catch((error: unknown) => {
  console.error("Typesense indexing failed:", error);
  process.exitCode = 1;
});
