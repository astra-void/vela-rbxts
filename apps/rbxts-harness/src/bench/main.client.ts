import { VelaBench } from "./runner";
import { scenarios } from "./scenarios";
import { specs } from "./specs";

VelaBench.serve("react", scenarios, specs);
