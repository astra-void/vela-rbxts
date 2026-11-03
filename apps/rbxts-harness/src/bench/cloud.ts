import { VelaBench } from "./runner";
import { scenarios } from "./scenarios";
import { specs } from "./specs";

/// What the Open Cloud Luau execution task imports, since no LocalScript runs there.
export = (request: VelaBench.Request) =>
	VelaBench.run("react", scenarios, specs, request);
