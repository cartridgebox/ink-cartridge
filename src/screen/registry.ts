import React from "react";
import type { RegisterOptions } from "./types.js";

/** One entry in the registry. */
interface RegistryEntry {
  /** Default props template registered for the component. */
  template: Record<string, unknown>;
  /** Parent component reference (null means the component is a root candidate). */
  parent: React.ComponentType<any> | null;
  /** Child components (maintained automatically by registerComponent). */
  children: Set<React.ComponentType<any>>;
}

/** Module-level registry: component → registration info. */
const registry = new Map<React.ComponentType<any>, RegistryEntry>();

/**
 * Register a component as a screen in the navigation tree.
 *
 * @param component  The React component (used as the unique token).
 * @param template   Default props for the component. Optional — when omitted,
 *                   the screen registers with no default props (equivalent to `{}`).
 * @param options    Optional registration options (e.g. `parent` to attach
 *                   the component under an existing node in the tree).
 *
 * @throws If the component has already been registered.
 */
export function registerComponent<C extends React.ComponentType<any>>(
  component: C,
  // An omitted template is stored as an empty record; a component with required
  // props still receives them at navigation time, so the cast only silences the
  // generic default — the empty template is valid for every registration.
  template: React.ComponentProps<C> = {} as React.ComponentProps<C>,
  options?: RegisterOptions,
): void {
  if (registry.has(component)) {
    throw new Error(
      `[Ink-Cartridge] Component "${component.displayName || component.name || "anonymous"}" is already registered. Duplicate registration is not allowed.`,
    );
  }

  // Resolve the parent before mutating the registry: a throw must leave the
  // registry untouched. Otherwise the caller's catch() still leaves a
  // half-registered component — parent pointing at an unregistered node, so it
  // is neither a root nor reachable — that no later registration can repair.
  let parentEntry: RegistryEntry | undefined;
  if (options?.parent) {
    parentEntry = registry.get(options.parent);
    if (!parentEntry) {
      const compName = component.displayName || component.name || "anonymous";
      const parentName =
        (options.parent as any).displayName ||
        (options.parent as any).name ||
        "anonymous";
      throw new Error(
        `[Ink-Cartridge] registerComponent("${compName}"): parent component "${parentName}" is not registered. ` +
        `Register the parent first with registerComponent(${parentName}, template).`,
      );
    }
  }

  registry.set(component, {
    template: template as Record<string, unknown>,
    parent: options?.parent ?? null,
    children: new Set(),
  });

  // When a parent is declared, register ourselves in the parent's children.
  if (parentEntry) {
    parentEntry.children.add(component);
  }
}

/** Get the template props registered for a component. */
export function getTemplate(
  component: React.ComponentType<any>,
): Record<string, unknown> | undefined {
  return registry.get(component)?.template;
}

/** Get the parent of a component. */
export function getParent(
  component: React.ComponentType<any>,
): React.ComponentType<any> | null | undefined {
  return registry.get(component)?.parent;
}

/** Get the children of a component. */
export function getChildren(
  component: React.ComponentType<any>,
): React.ComponentType<any>[] {
  const entry = registry.get(component);
  return entry ? Array.from(entry.children) : [];
}

/** Check whether a component is registered. */
export function hasComponent(component: React.ComponentType<any>): boolean {
  return registry.has(component);
}

/** Get all root components (components whose parent is null). */
export function getRoots(): React.ComponentType<any>[] {
  const roots: React.ComponentType<any>[] = [];
  for (const [component, entry] of registry) {
    if (entry.parent === null) {
      roots.push(component);
    }
  }
  return roots;
}

/** Check whether `child` is a direct child of `parent`. */
export function isChildOf(
  child: React.ComponentType<any>,
  parent: React.ComponentType<any>,
): boolean {
  const entry = registry.get(child);
  return entry?.parent === parent;
}

/** Clear all registrations (test use only). */
export function clearRegistry(): void {
  registry.clear();
}
