/** Regions and floors (floors/overview.md). Floor 0 is the Prologue. First release: Regions 1–4 (0035). */
export interface RegionInfo {
  n: number;
  name: string;
  /** What the region teaches, shown beside its name wherever the name is shown (0128). */
  topic: string;
  speaker: string;
}

export interface FloorInfo {
  n: number;
  region: number;
  name: string;
}

export const regions: Record<number, RegionInfo> = {
  1: { n: 1, name: "The Overgrown Halls", topic: "cables, network interfaces and MAC addresses", speaker: "you" },
  2: { n: 2, name: "The Sorting Works", topic: "switches", speaker: "you" },
  3: { n: 3, name: "The Lantern Town", topic: "IP addresses, subnets and DHCP", speaker: "you" },
  4: { n: 4, name: "The Cathedral of Crossings", topic: "routers and routing", speaker: "you" },
};

export const floors: Record<number, FloorInfo> = {
  0: { n: 0, region: 1, name: "Prologue" },
  1: { n: 1, region: 1, name: "Cables and Links" },
  2: { n: 2, region: 1, name: "Frames and MAC Addresses" },
  3: { n: 3, region: 2, name: "Switches" },
  4: { n: 4, region: 2, name: "Switch Tables and Loops" },
  5: { n: 5, region: 3, name: "IP Addresses" },
  6: { n: 6, region: 3, name: "Packets and ARP" },
  7: { n: 7, region: 3, name: "Subnets and DHCP" },
  8: { n: 8, region: 4, name: "Routers" },
  9: { n: 9, region: 4, name: "Routing Across Networks" },
};

export const lore = {
  intro:
    "You are a repair robot. You've just switched back on in a palace whose machines stopped talking to each other years ago. Getting them talking again is your job.",
};
