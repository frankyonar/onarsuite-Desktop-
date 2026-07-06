import type { MemoryFileRecord } from '../../../shared/types';

export function generateOsmem(record: MemoryFileRecord): string {
  const topics = record.topics.join(', ');
  const entities = record.entities.map((entity) => `${line(entity.type)}: ${line(entity.value)}`);
  const relations = record.relations.map((relation) => `${line(relation.type)} -> ${line(relation.target)}`);
  const chunks = record.chunks.map((chunk) => `c${chunk.order + 1} = ${line(chunk.title)}`);

  return [
    'OSMEM/1.0',
    `@node file:${record.id}`,
    `name: ${line(record.name)}`,
    `path: ${line(record.path)}`,
    `mime: ${line(record.mimeType)}`,
    `ext: ${line(record.extension)}`,
    `size: ${record.size}`,
    `created: ${record.createdAt}`,
    `modified: ${record.modifiedAt}`,
    `hash: ${record.hash}`,
    `kind: ${line(record.documentKind)}`,
    `summary.short: ${line(record.summaryShort)}`,
    `summary.long: ${line(record.summaryLong)}`,
    `topics: ${line(topics)}`,
    'entities:',
    ...(entities.length ? entities : ['none']),
    'relations:',
    ...(relations.length ? relations : ['none']),
    'permissions:',
    `local_only = ${record.privacy.localOnly}`,
    `send_to_cloud = ${record.privacy.askBeforeCloud ? 'ask' : 'allowed'}`,
    `sensitive_detected = ${record.privacy.sensitiveDetected}`,
    `excluded_from_ai = ${record.privacy.excludedFromAi}`,
    `allowed_scopes = ${record.privacy.allowedScopes.map(line).join(', ')}`,
    'chunks:',
    ...(chunks.length ? chunks : ['none']),
  ].join('\n');
}

function line(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}
