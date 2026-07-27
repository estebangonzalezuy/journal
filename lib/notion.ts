/**
 * Acceso a Notion: página Journal (subpágina por día, formato "D/M") y base de
 * datos Tareas.
 *
 * El mapeo de propiedades de la base Tareas se resuelve leyendo el schema real
 * en cada arranque en frío, no asumiendo nombres. Así, si algún día renombrás
 * "Deadline" o agregás una propiedad, el endpoint no se rompe: escribe lo que
 * existe e ignora lo que no.
 */

import { Client } from "@notionhq/client";

import { optional, required } from "./env";

let client: Client | null = null;

function notion(): Client {
  if (!client) {
    client = new Client({
      auth: required("NOTION_TOKEN"),
      notionVersion: "2022-06-28",
    });
  }
  return client;
}

/** Notion rechaza rich_text de más de 2000 caracteres por bloque. */
const MAX_BLOCK_CHARS = 1800;

function chunk(text: string, size = MAX_BLOCK_CHARS): string[] {
  if (text.length <= size) return [text];
  const out: string[] = [];
  let rest = text;
  while (rest.length > size) {
    let cut = rest.lastIndexOf(" ", size);
    if (cut < size / 2) cut = size;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}

function paragraphs(text: string) {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .flatMap((block) => chunk(block))
    .map((content) => ({
      object: "block" as const,
      type: "paragraph" as const,
      paragraph: {
        rich_text: [{ type: "text" as const, text: { content } }],
      },
    }));
}

// ---------------------------------------------------------------------------
// Journal
// ---------------------------------------------------------------------------

/** Busca la subpágina del día dentro de la página Journal. */
export async function findDayPage(title: string): Promise<string | null> {
  const parent = required("NOTION_JOURNAL_PAGE_ID");
  let cursor: string | undefined;

  do {
    const res = await notion().blocks.children.list({
      block_id: parent,
      start_cursor: cursor,
      page_size: 100,
    });

    for (const block of res.results as any[]) {
      if (block.type === "child_page" && block.child_page?.title === title) {
        return block.id as string;
      }
    }

    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return null;
}

/** Devuelve la subpágina del día, creándola si todavía no existe. */
export async function findOrCreateDayPage(title: string): Promise<string> {
  const existing = await findDayPage(title);
  if (existing) return existing;

  const page = await notion().pages.create({
    parent: { page_id: required("NOTION_JOURNAL_PAGE_ID") },
    properties: {
      title: { title: [{ type: "text", text: { content: title } }] },
    },
  });

  return page.id;
}

/** Agrega una entrada con su hora al final de la página del día. */
export async function appendJournalEntry(
  pageId: string,
  time: string,
  text: string,
): Promise<void> {
  await notion().blocks.children.append({
    block_id: pageId,
    children: [
      {
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [{ type: "text", text: { content: time } }],
        },
      },
      ...paragraphs(text),
    ],
  });
}

/** Extrae el texto plano de una página de Notion (para los resúmenes). */
export async function readPageText(pageId: string): Promise<string> {
  const lines: string[] = [];
  let cursor: string | undefined;

  do {
    const res = await notion().blocks.children.list({
      block_id: pageId,
      start_cursor: cursor,
      page_size: 100,
    });

    for (const block of res.results as any[]) {
      const payload = block[block.type];
      const richText = payload?.rich_text;
      if (Array.isArray(richText) && richText.length > 0) {
        const text = richText.map((rt: any) => rt.plain_text ?? "").join("").trim();
        if (text) lines.push(text);
      }
    }

    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Tareas
// ---------------------------------------------------------------------------

type PropertyMap = {
  title: string;
  deadline?: string;
  status?: { name: string; type: "status" | "select"; option?: string };
  assignee?: string;
  estimated?: string;
};

let cachedProps: PropertyMap | null = null;

function findProp(
  properties: Record<string, any>,
  preferredName: string,
  types: string[],
): [string, any] | null {
  const entries = Object.entries(properties);
  const byName = entries.find(
    ([name, prop]) =>
      name.toLowerCase() === preferredName.toLowerCase() && types.includes(prop.type),
  );
  if (byName) return byName;
  return entries.find(([, prop]) => types.includes(prop.type)) ?? null;
}

/** Lee el schema real de la base Tareas y arma el mapeo de propiedades. */
async function taskProperties(): Promise<PropertyMap> {
  if (cachedProps) return cachedProps;

  const db = (await notion().databases.retrieve({
    database_id: required("NOTION_TASKS_DB_ID"),
  })) as any;

  const properties: Record<string, any> = db.properties ?? {};

  const titleEntry = Object.entries(properties).find(([, p]) => p.type === "title");
  if (!titleEntry) {
    throw new Error("La base de Notion 'Tareas' no tiene propiedad de tipo title");
  }

  const map: PropertyMap = { title: titleEntry[0] };

  const deadline = findProp(properties, "Deadline", ["date"]);
  if (deadline) map.deadline = deadline[0];

  const status = findProp(properties, "Status", ["status", "select"]);
  if (status) {
    const [name, prop] = status;
    const options: any[] =
      prop.type === "status" ? (prop.status?.options ?? []) : (prop.select?.options ?? []);
    const wanted = (optional("NOTION_TASK_STATUS") || "To Do").toLowerCase();
    const option =
      options.find((o) => String(o.name).toLowerCase() === wanted) ?? options[0];
    map.status = { name, type: prop.type, option: option?.name };
  }

  const assignee = findProp(properties, "Assignee", ["people"]);
  if (assignee) map.assignee = assignee[0];

  const estimated = findProp(properties, "Estimated", ["number"]);
  if (estimated) map.estimated = estimated[0];

  cachedProps = map;
  return map;
}

export type NewTask = {
  name: string;
  /** ISO 8601 con offset: "2026-07-31T10:00:00+02:00". */
  deadlineIso: string;
  estimatedMinutes?: number | null;
};

/** Crea la tarea en la base Tareas y devuelve su URL. */
export async function createTask(task: NewTask): Promise<string> {
  const map = await taskProperties();
  const properties: Record<string, any> = {
    [map.title]: { title: [{ type: "text", text: { content: task.name } }] },
  };

  if (map.deadline) {
    properties[map.deadline] = { date: { start: task.deadlineIso } };
  }

  if (map.status?.option) {
    properties[map.status.name] =
      map.status.type === "status"
        ? { status: { name: map.status.option } }
        : { select: { name: map.status.option } };
  }

  const assigneeId = optional("NOTION_ASSIGNEE_USER_ID");
  if (map.assignee && assigneeId) {
    properties[map.assignee] = { people: [{ object: "user", id: assigneeId }] };
  }

  if (map.estimated && typeof task.estimatedMinutes === "number") {
    properties[map.estimated] = { number: task.estimatedMinutes };
  }

  const page = (await notion().pages.create({
    parent: { database_id: required("NOTION_TASKS_DB_ID") },
    properties,
  })) as any;

  return page.url ?? `https://www.notion.so/${String(page.id).replace(/-/g, "")}`;
}
