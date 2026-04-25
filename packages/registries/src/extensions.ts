// Internal facade: re-export extension-group + budget + type-mapping registries
// from public @peac/kernel. See verifier-context.ts for the design rationale.

export {
  EXTENSION_GROUPS,
  EXTENSION_BUDGET,
  TYPE_TO_EXTENSION_MAP,
  findExtensionGroup,
} from '@peac/kernel';

export type { ExtensionGroupEntry } from '@peac/kernel';
