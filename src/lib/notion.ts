import { env } from './env';
import { toNotionDate } from './dates';
import type { TareaDetectada } from './claude';

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

async function notion<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${NOTION_API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${env.notionToken}`,
      'notion-version': NOTION_VERSION,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Notion ${path} falló (${response.status}): ${await response.text()}`);
  }

  return (await response.json()) as T;
}

type Block = {
  id: string;
  type: string;
  child_page?: { title: string };
  [key: string]: unknown;
};

type BlockList = { results: Block[]; has_more: boolean; next_cursor: string | null };

async function allChildren(blockId: string): Promise<Block[]> {
  const blocks: Block[] = [];
  let cursor: string | null = null;

  do {
    const query = cursor ? `?page_size=100&start_cursor=${cursor}` : '?page_size=100';
    const page: BlockList = await notion<BlockList>(`/blocks/${blockId}/children${query}`);
    blocks.push(...page.results);
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);

  return blocks;
}

/** Busca la subpágina del día (título "D/M") dentro de la página Journal. */
export async function findDayPage(title: string): Promise<string | null> {
  const children = await allChildren(env.notionJournalPageId);
  const match = children.find(
    (block) => block.type === 'child_page' && block.child_page?.title.trim() === title,
  );
  return match?.id ?? null;
}

async function createDayPage(title: string): Promise<string> {
  const page = await notion<{ id: string }>('/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: { page_id: env.notionJournalPageId },
      properties: {
        title: { title: [{ text: { content: title } }] },
      },
    }),
  });
  return page.id;
}

export async function findOrCreateDayPage(title: string): Promise<string> {
  return (await findDayPage(title)) ?? (await createDayPage(title));
}

/** Agrega la entrada al final de la página del día, con la hora como encabezado. */
export async function appendEntry(pageId: string, time: string, text: string): Promise<void> {
  const paragraphs = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  await notion(`/blocks/${pageId}/children`, {
    method: 'PATCH',
    body: JSON.stringify({
      children: [
        {
          object: 'block',
          type: 'heading_3',
          heading_3: { rich_text: [{ type: 'text', text: { content: time } }] },
        },
        // Notion corta los rich_text a 2000 caracteres; partimos por las dudas.
        ...paragraphs.flatMap((paragraph) =>
          chunk(paragraph, 1900).map((piece) => ({
            object: 'block',
            type: 'paragraph',
            paragraph: { rich_text: [{ type: 'text', text: { content: piece } }] },
          })),
        ),
      ],
    }),
  });
}

function chunk(text: string, size: number): string[] {
  if (text.length <= size) return [text];
  const pieces: string[] = [];
  for (let i = 0; i < text.length; i += size) pieces.push(text.slice(i, i + size));
  return pieces;
}

/** Texto plano de una página, para pasárselo a Claude en los resúmenes. */
export async function readPageText(pageId: string): Promise<string> {
  const blocks = await allChildren(pageId);
  const lines: string[] = [];

  for (const block of blocks) {
    const content = block[block.type] as { rich_text?: { plain_text: string }[] } | undefined;
    const text = (content?.rich_text ?? []).map((piece) => piece.plain_text).join('');
    if (text.trim()) lines.push(text.trim());
  }

  return lines.join('\n');
}

type DatabaseSchema = {
  properties: Record<string, { id: string; name: string; type: string }>;
};

function findProperty(
  schema: DatabaseSchema,
  preferredName: string,
  type?: string,
): { name: string; type: string } | null {
  const properties = Object.values(schema.properties);
  const byName = properties.find(
    (property) => property.name.toLowerCase() === preferredName.toLowerCase(),
  );
  if (byName && (!type || byName.type === type)) return byName;
  if (!type) return null;
  return properties.find((property) => property.type === type) ?? null;
}

/** "1h30", "90m", "2 horas" → minutos. Devuelve null si no se puede interpretar. */
function toMinutes(estimated: string): number | null {
  const hours = estimated.match(/(\d+(?:[.,]\d+)?)\s*(?:h|hs|hora)/i);
  const minutes = estimated.match(/(\d+)\s*(?:m|min)/i);
  let total = 0;
  if (hours) total += Number(hours[1].replace(',', '.')) * 60;
  if (minutes) total += Number(minutes[1]);
  if (!total) {
    const bare = estimated.match(/^\s*(\d+)\s*$/);
    if (bare) total = Number(bare[1]);
  }
  return total > 0 ? Math.round(total) : null;
}

/**
 * Crea la tarea en la base "Tareas". Lee el schema en runtime para no
 * romperse si los tipos de Status/Estimated no son los esperados.
 */
export async function createTask(task: TareaDetectada): Promise<string> {
  const schema = await notion<DatabaseSchema>(`/databases/${env.notionTasksDatabaseId}`);
  const properties: Record<string, unknown> = {};

  const titleProperty = findProperty(schema, 'Name', 'title');
  if (!titleProperty) throw new Error('La base Tareas no tiene propiedad de tipo title');
  properties[titleProperty.name] = { title: [{ text: { content: task.nombre } }] };

  const deadline = findProperty(schema, 'Deadline', 'date');
  if (deadline) {
    properties[deadline.name] = { date: { start: toNotionDate(task.fecha, task.hora) } };
  }

  const assignee = findProperty(schema, 'Assignee', 'people');
  if (assignee && env.notionAssigneeUserId) {
    properties[assignee.name] = { people: [{ object: 'user', id: env.notionAssigneeUserId }] };
  }

  const status = findProperty(schema, 'Status');
  const statusValue = process.env.NOTION_TASK_STATUS;
  if (status && statusValue) {
    if (status.type === 'status') properties[status.name] = { status: { name: statusValue } };
    if (status.type === 'select') properties[status.name] = { select: { name: statusValue } };
  }

  const estimated = findProperty(schema, 'Estimated');
  if (estimated && task.estimado) {
    if (estimated.type === 'number') {
      const minutes = toMinutes(task.estimado);
      if (minutes) properties[estimated.name] = { number: minutes };
    } else if (estimated.type === 'rich_text') {
      properties[estimated.name] = {
        rich_text: [{ text: { content: task.estimado } }],
      };
    }
  }

  const page = await notion<{ id: string; url: string }>('/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: { database_id: env.notionTasksDatabaseId },
      properties,
    }),
  });

  return page.url;
}
