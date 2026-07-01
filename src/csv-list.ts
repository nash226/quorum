export function serializeDelimitedList(values: string[]): string {
  return values.map(escapeDelimitedValue).join(" | ");
}

export function parseDelimitedList(value: string): string[] {
  const values: string[] = [];
  let current = "";

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const nextCharacter = value[index + 1];

    if (
      character === "\\" &&
      (nextCharacter === "\\" || nextCharacter === "|")
    ) {
      current += nextCharacter;
      index += 1;
      continue;
    }

    if (value.slice(index, index + 3) === " | ") {
      values.push(current.trim());
      current = "";
      index += 2;
      continue;
    }

    current += character;
  }

  values.push(current.trim());

  return values.filter(Boolean);
}

function escapeDelimitedValue(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("|", "\\|");
}
