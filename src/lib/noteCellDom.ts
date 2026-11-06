export interface SerializedCellPart {
  text: string;
  block: boolean;
}

export function joinSerializedCellParts(parts: SerializedCellPart[]): string {
  return parts.reduce((result, part, index) => {
    if (index === 0) return part.text;
    const needsLineBreak = (parts[index - 1].block || part.block)
      && !result.endsWith('\n') && !part.text.startsWith('\n');
    return result + (needsLineBreak ? '\n' : '') + part.text;
  }, '');
}
