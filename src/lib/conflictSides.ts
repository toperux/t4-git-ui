// Naming the two sides of a conflict in one place: the diff header's buttons, the file menu's items
// and the confirmation they raise all have to agree.
import type { ConflictSide, ConflictSides } from "../api/types";

/**
 * Button / menu label. The backend names the sides while an operation is in progress
 * (`Keep main's version`); without them git's own vocabulary has no possessive to take
 * (`Keep our version` — never "our's").
 */
export function sideLabel(sides: ConflictSides | null | undefined, side: ConflictSide): string {
  const name = sides?.[side];
  return name ? `Keep ${name}'s version` : `Keep ${side === "ours" ? "our" : "their"} version`;
}

/**
 * What `resolveConflict`'s confirmation interpolates — it reads "Replace a.rs with <name>'s version?",
 * so the fallback carries its own noun rather than the bare "our".
 */
export function sideName(sides: ConflictSides | null | undefined, side: ConflictSide): string {
  return sides?.[side] ?? (side === "ours" ? "our side" : "their side");
}
