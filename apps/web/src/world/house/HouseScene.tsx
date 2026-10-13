import { useMemo } from "react";
import { useBarred } from "../observatory/ObservatoryScene";
import { MachineScene } from "../room/MachineScene";
import { houseLayout } from "./layout";

// Another computer's room (lantern, quill…: CORE-06's computer layout), entered through its door.
// Its light is the old lamp by the back wall.

const LAMP = [{ position: [-2.4, 1.9, -3.2] as [number, number, number], colour: "#FFC27A", strength: 3.2 }];

export function HouseScene({ device }: { device: string }) {
  const barred = useBarred();
  const layout = useMemo(() => houseLayout(), []);
  return <MachineScene device={device} layout={layout} barred={barred} glows={LAMP} />;
}
