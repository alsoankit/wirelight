import { useMemo } from "react";
import { useBarred } from "../observatory/ObservatoryScene";
import { useRegion } from "../region";
import { Board } from "../room/Furniture";
import { MachineScene } from "../room/MachineScene";
import { houseLayout } from "./layout";

// Another computer's room (lantern, quill…: CORE-06's computer layout), entered through its door.
// Its light is the old lamp by the back wall.

const LAMP = [{ position: [-2.4, 1.9, -3.2] as [number, number, number], colour: "#FFC27A", strength: 3.2 }];

export function HouseScene({ device }: { device: string }) {
  const barred = useBarred();
  const region = useRegion();
  const layout = useMemo(() => houseLayout(region), [region]);
  return (
    <MachineScene device={device} layout={layout} barred={barred} glows={LAMP}>
      <Board device={device} kind="routes" at={[2.5, 0, 2.2]} turn={-0.6} />
      <Board device={device} kind="ledger" at={[-2.6, 0, 1.9]} turn={0.7} />
    </MachineScene>
  );
}
