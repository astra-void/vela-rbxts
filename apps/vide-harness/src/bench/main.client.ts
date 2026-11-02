import Vide from "@rbxts/vide";
import { VelaBench } from "./runner";
import { scenarios } from "./scenarios";
import { specs } from "./specs";

// Studio play mode compiles below O2, where Vide defaults to strict mode and runs every effect twice.
Vide.strict = false;
VelaBench.serve("vide", scenarios, specs, { strict: Vide.strict });
