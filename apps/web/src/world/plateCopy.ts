export async function copyPlateValue(
  value: string,
  clipboard: Pick<Clipboard, "writeText"> = navigator.clipboard,
): Promise<void> {
  await clipboard.writeText(value);
}

export function plateValues(open: boolean, mac?: string, addrs: string[] = []) {
  if (!open) return [];
  return [...(mac ? [{ kind: "MAC", value: mac }] : []), ...addrs.map((value) => ({ kind: "address", value }))];
}
