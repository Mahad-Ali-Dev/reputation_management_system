"use server";
/**
 * Server-action shim for knowledge-gap mutations.
 *
 * Next.js requires server actions imported by client components to be defined
 * (not just re-exported) inside a module with a top-level "use server" directive.
 */
import {
  addKnowledgeAnswer as _addKnowledgeAnswer,
  dismissKnowledgeGap as _dismissKnowledgeGap,
  teachKnowledgeGap as _teachKnowledgeGap,
} from "./knowledge-gaps";

export async function teachKnowledgeGap(form: FormData): Promise<void> {
  return _teachKnowledgeGap(form);
}

export async function dismissKnowledgeGap(form: FormData): Promise<void> {
  return _dismissKnowledgeGap(form);
}

export async function addKnowledgeAnswer(form: FormData): Promise<void> {
  return _addKnowledgeAnswer(form);
}
