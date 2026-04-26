import { createVelaProgramTransformer } from "@vela-rbxts/rbxtsc-host";

export { createVelaProgramTransformer as createTransformer };

/** @deprecated Use createVelaProgramTransformer instead. */
export { createVelaProgramTransformer as createRbxtsTailwindProgramTransformer };

export default createVelaProgramTransformer;
